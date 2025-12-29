// --- CONFIGURACIÓN DE SUPABASE ---
// URL de tu proyecto
const SUPABASE_URL = 'https://ogpprghtohbumqihzxwt.supabase.co'; 

// Tu "Chorizo" (Anon Public Key) - ¡La buena!
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncHByZ2h0b2hidW1xaWh6eHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMTA5MDMsImV4cCI6MjA4MjU4NjkwM30.TDkm0NHDNh0gec26s6gnvHH_euJPuGLqX5nghMXy2wI';    

// Inicializamos el cliente
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- VARIABLES GLOBALES ---
let preguntasActuales = [];
let indicePregunta = 0;
let aciertos = 0;
let fallos = 0;
let testIdActual = null;

// --- AL CARGAR LA PÁGINA ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Iniciando sistema Opo-Mákina (Modo Cerveza ON 🍺)...");
    await verificarConexion();
    await cargarListaDeTests();
});

// 1. Verificar que Supabase responde
async function verificarConexion() {
    const statusElem = document.getElementById('db-status');
    
    // Consulta ligera de prueba
    const { data, error } = await supabaseClient.from('bloques').select('count');
    
    if (error) {
        console.error("Error de conexión:", error);
        statusElem.innerHTML = "Estado: Error conexión ❌";
        statusElem.style.color = "red";
    } else {
        console.log("¡Conexión establecida con éxito!");
        statusElem.innerHTML = "Estado: Conectado a Supabase 🟢";
        statusElem.style.color = "#39ff14";
    }
}

// 2. Cargar el desplegable con los tests disponibles
async function cargarListaDeTests() {
    const selector = document.getElementById('test-selector');
    selector.innerHTML = '<option value="">Cargando...</option>';

    // Pedimos los tests visibles
    const { data: tests, error } = await supabaseClient
        .from('tests')
        .select('id, nombre')
        .eq('visible', true)
        .order('id', { ascending: true });

    if (error) {
        console.error("Error cargando tests:", error);
        selector.innerHTML = '<option value="">Error cargando lista</option>';
        return;
    }

    // Limpiamos y rellenamos
    selector.innerHTML = '<option value="">-- Selecciona un Test --</option>';
    if (tests && tests.length > 0) {
        tests.forEach(test => {
            const option = document.createElement('option');
            option.value = test.id;
            option.textContent = test.nombre;
            selector.appendChild(option);
        });
    } else {
        selector.innerHTML = '<option value="">No hay tests visibles</option>';
    }
}

// 3. Descargar las preguntas del test elegido
async function cargarPreguntasDelTest() {
    const selector = document.getElementById('test-selector');
    testIdActual = selector.value;

    if (!testIdActual) {
        alert("Por favor, selecciona un test válido.");
        return;
    }

    // UI Loading
    document.getElementById('loading').style.display = 'block';
    document.getElementById('quiz-area').style.display = 'none';

    // Consulta a la tabla preguntas
    const { data: preguntas, error } = await supabaseClient
        .from('preguntas')
        .select('*')
        .eq('test_id', testIdActual)
        .order('numero_orden', { ascending: true });

    document.getElementById('loading').style.display = 'none';

    if (error) {
        alert("Error bajando preguntas: " + error.message);
        return;
    }

    if (!preguntas || preguntas.length === 0) {
        alert("Este test está vacío. ¡Dile a Cifra que meta más preguntas!");
        return;
    }

    preguntasActuales = preguntas;
    indicePregunta = 0;
    aciertos = 0;
    fallos = 0;
    mostrarPregunta();
}

// 4. Pintar la pregunta
function mostrarPregunta() {
    const pregunta = preguntasActuales[indicePregunta];
    const quizArea = document.getElementById('quiz-area');
    quizArea.style.display = 'block';

    // Contador
    document.getElementById('question-counter').innerText = 
        `Pregunta ${indicePregunta + 1} / ${preguntasActuales.length}`;

    // Enunciado
    document.getElementById('question-text').innerText = pregunta.enunciado;

    // Opciones
    const container = document.getElementById('options-container');
    container.innerHTML = '';
    
    // Resetear visuales
    document.getElementById('feedback-area').style.display = 'none';
    document.getElementById('btn-next').style.display = 'none';

    const letras = ['a', 'b', 'c', 'd'];
    letras.forEach(letra => {
        // Accedemos dinámicamente: opcion_a, opcion_b...
        const textoOpcion = pregunta[`opcion_${letra}`];
        
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = `<strong>${letra.toUpperCase()})</strong> ${textoOpcion}`;
        btn.onclick = () => verificarRespuesta(letra, pregunta.correcta, pregunta.feedback);
        container.appendChild(btn);
    });
}

// 5. Verificar respuesta
function verificarRespuesta(letraElegida, letraCorrecta, feedbackTexto) {
    // Bloquear botones
    const botones = document.querySelectorAll('.option-btn');
    botones.forEach(btn => btn.disabled = true);

    const esCorrecta = (letraElegida.toLowerCase() === letraCorrecta.toLowerCase());
    const feedbackDiv = document.getElementById('feedback-area');

    // Colorear
    botones.forEach(btn => {
        const letraBtn = btn.innerText.charAt(0).toLowerCase();
        
        if (letraBtn === letraCorrecta) {
            btn.classList.add('correct');
        }
        
        if (letraBtn === letraElegida && !esCorrecta) {
            btn.classList.add('wrong');
        }
    });

    // Feedback
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

    document.getElementById('btn-next').style.display = 'inline-block';
}

// 6. Siguiente pregunta
function siguientePregunta() {
    indicePregunta++;
    if (indicePregunta < preguntasActuales.length) {
        mostrarPregunta();
    } else {
        finalizarTest();
    }
}

// 7. Finalizar
function finalizarTest() {
    const quizArea = document.getElementById('quiz-area');
    const nota = (aciertos / preguntasActuales.length) * 10;
    
    let mensaje = "";
    if (nota >= 5) mensaje = "¡APROBADO MÁKINA! 🎉🍺";
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
