// --- CONFIGURACIÓN DE SUPABASE ---
// ¡¡IMPORTANTE!!: Pega aquí tus claves de Supabase (Project Settings -> API)
const SUPABASE_URL = 'AQUI_TU_PROJECT_URL'; // Ej: https://xyz.supabase.co
const SUPABASE_KEY = 'AQUI_TU_ANON_KEY';    // Ej: eyJhbGciOiJIUzI1NiIsInR5...

// Inicializamos el cliente (el puente con la base de datos)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- VARIABLES GLOBALES ---
let preguntasActuales = [];
let indicePregunta = 0;
let aciertos = 0;
let fallos = 0;
let testIdActual = null;

// --- AL CARGAR LA PÁGINA ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Iniciando sistema Opo-Mákina...");
    await verificarConexion();
    await cargarListaDeTests();
});

// 1. Verificar que Supabase responde
async function verificarConexion() {
    const { data, error } = await supabaseClient.from('bloques').select('count');
    const statusElem = document.getElementById('db-status');
    
    if (error) {
        console.error("Error de conexión:", error);
        statusElem.innerHTML = "Estado: Error conexión ❌";
        statusElem.style.color = "red";
    } else {
        console.log("Conexión establecida con Supabase.");
        statusElem.innerHTML = "Estado: Conectado a Supabase 🟢";
        statusElem.style.color = "#39ff14";
    }
}

// 2. Cargar el desplegable con los tests disponibles en la BD
async function cargarListaDeTests() {
    const selector = document.getElementById('test-selector');
    selector.innerHTML = '<option value="">Cargando...</option>';

    // Pedimos: id y nombre de la tabla 'tests' donde visible sea true
    const { data: tests, error } = await supabaseClient
        .from('tests')
        .select('id, nombre')
        .eq('visible', true)
        .order('id', { ascending: true });

    if (error) {
        alert("Error cargando tests: " + error.message);
        return;
    }

    // Limpiamos y rellenamos
    selector.innerHTML = '<option value="">-- Selecciona un Test --</option>';
    tests.forEach(test => {
        const option = document.createElement('option');
        option.value = test.id;
        option.textContent = test.nombre;
        selector.appendChild(option);
    });
}

// 3. Descargar las preguntas del test elegido
async function cargarPreguntasDelTest() {
    const selector = document.getElementById('test-selector');
    testIdActual = selector.value;

    if (!testIdActual) {
        alert("Por favor, selecciona un test válido.");
        return;
    }

    // Mostrar loading
    document.getElementById('loading').style.display = 'block';
    document.getElementById('quiz-area').style.display = 'none';

    // CONSULTA A SUPABASE: Dame todas las preguntas de este test_id
    const { data: preguntas, error } = await supabaseClient
        .from('preguntas')
        .select('*')
        .eq('test_id', testIdActual)
        .order('numero_orden', { ascending: true }); // Ordenadas por su número

    document.getElementById('loading').style.display = 'none';

    if (error) {
        alert("Error bajando preguntas: " + error.message);
        return;
    }

    if (preguntas.length === 0) {
        alert("Este test está vacío todavía. ¡Dile a Cifra que meta caña!");
        return;
    }

    // Todo listo, empezamos
    preguntasActuales = preguntas;
    indicePregunta = 0;
    aciertos = 0;
    fallos = 0;
    mostrarPregunta();
}

// 4. Pintar la pregunta en pantalla
function mostrarPregunta() {
    const pregunta = preguntasActuales[indicePregunta];
    const quizArea = document.getElementById('quiz-area');
    quizArea.style.display = 'block';

    // Actualizar contador
    document.getElementById('question-counter').innerText = 
        `Pregunta ${indicePregunta + 1} / ${preguntasActuales.length}`;

    // Poner enunciado
    document.getElementById('question-text').innerText = pregunta.enunciado;

    // Limpiar opciones anteriores
    const container = document.getElementById('options-container');
    container.innerHTML = '';
    
    // Ocultar feedback y botón siguiente
    document.getElementById('feedback-area').style.display = 'none';
    document.getElementById('btn-next').style.display = 'none';

    // Crear botones de opciones (A, B, C, D)
    const letras = ['a', 'b', 'c', 'd'];
    letras.forEach(letra => {
        const textoOpcion = pregunta[`opcion_${letra}`]; // Magia: accede a opcion_a, opcion_b...
        
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = `<strong>${letra.toUpperCase()})</strong> ${textoOpcion}`;
        btn.onclick = () => verificarRespuesta(letra, pregunta.correcta, pregunta.feedback);
        container.appendChild(btn);
    });
}

// 5. Verificar si acertó
function verificarRespuesta(letraElegida, letraCorrecta, feedbackTexto) {
    // Bloquear todos los botones para que no pueda cambiar
    const botones = document.querySelectorAll('.option-btn');
    botones.forEach(btn => btn.disabled = true);

    const esCorrecta = (letraElegida.toLowerCase() === letraCorrecta.toLowerCase());
    const feedbackDiv = document.getElementById('feedback-area');

    // Colorear botones
    botones.forEach(btn => {
        const letraBtn = btn.innerText.charAt(0).toLowerCase(); // 'a', 'b'...
        
        if (letraBtn === letraCorrecta) {
            btn.classList.add('correct'); // Verde siempre a la correcta
        }
        
        if (letraBtn === letraElegida && !esCorrecta) {
            btn.classList.add('wrong'); // Rojo si fallaste esta
        }
    });

    // Mostrar Feedback
    feedbackDiv.style.display = 'block';
    if (esCorrecta) {
        feedbackDiv.style.border = '1px solid #39ff14';
        feedbackDiv.innerHTML = `<strong style="color: #39ff14">¡CORRECTO!</strong><br><br>${feedbackTexto || ''}`;
        aciertos++;
    } else {
        feedbackDiv.style.border = '1px solid #ff073a';
        feedbackDiv.innerHTML = `<strong style="color: #ff073a">¡ERROR!</strong><br><br>${feedbackTexto || ''}`;
        fallos++;
    }

    // Guardar intento en BD (Opcional, versión PRO)
    // guardarEstadistica(esCorrecta);

    // Mostrar botón siguiente
    document.getElementById('btn-next').style.display = 'inline-block';
}

// 6. Pasar a la siguiente
function siguientePregunta() {
    indicePregunta++;
    if (indicePregunta < preguntasActuales.length) {
        mostrarPregunta();
    } else {
        finalizarTest();
    }
}

// 7. Pantalla final
function finalizarTest() {
    const quizArea = document.getElementById('quiz-area');
    const nota = (aciertos / preguntasActuales.length) * 10;
    
    let mensaje = "";
    if (nota >= 5) mensaje = "¡APROBADO MÁKINA! 🎉";
    else mensaje = "A estudiar más... 📚";

    quizArea.innerHTML = `
        <h2 style="color: var(--neon-purple); text-align: center;">TEST FINALIZADO</h2>
        <div style="text-align: center; font-size: 1.5rem; margin: 30px;">
            <p>Aciertos: <span style="color: #39ff14">${aciertos}</span></p>
            <p>Fallos: <span style="color: #ff073a">${fallos}</span></p>
            <p>Nota: <strong>${nota.toFixed(2)}</strong></p>
            <h3>${mensaje}</h3>
            <button class="btn" onclick="location.reload()">VOLVER AL MENÚ</button>
        </div>
    `;
}
