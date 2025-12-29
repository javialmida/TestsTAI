// 1. CONFIGURACIÓN SUPABASE
const SUPABASE_URL = "https://ogpprghtohbumqihzxwt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncHByZ2h0b2hidW1xaWh6eHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMTA5MDMsImV4cCI6MjA4MjU4NjkwM30.TDkm0NHDNh0gec26s6gnvHH_euJPuGLqX5nghMXy2wI";

let preguntasTest = [];
let preguntaActualIndex = 0;
let puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
let modoEstudio = true;
let esDudada = false;

// Conector estándar
async function supabaseFetch(endpoint) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        method: 'GET',
        headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json"
        }
    });
    return await response.json();
}

// 2. CARGA DE MENÚ (Basado en tus IDs de index.html)
async function cargarMenuDinamico() {
    try {
        const data = await supabaseFetch("tests?select=id,nombre,bloque_id&visible=eq.true&order=id.asc");
        
        // Limpiamos contenedores
        ['lista-B1', 'lista-B2', 'lista-B3', 'lista-B4', 'lista-oficiales'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = "";
        });

        data.forEach(t => {
            const label = document.createElement('label');
            label.className = 'test-item';
            label.innerHTML = `<input type="radio" name="test-select" value="${t.id}"> <span>${t.nombre}</span>`;
            
            const contenedorId = t.bloque_id === 5 ? 'lista-oficiales' : `lista-B${t.bloque_id}`;
            const contenedor = document.getElementById(contenedorId);
            if (contenedor) contenedor.appendChild(label);
        });
    } catch (e) { console.error("Error cargando menú", e); }
}

// 3. COMENZAR TEST
document.getElementById('btnComenzar').onclick = async () => {
    const radioSelected = document.querySelector('input[name="test-select"]:checked');
    if (!radioSelected) return alert("Selecciona un test 🚀");
    
    const btn = document.getElementById('btnComenzar');
    btn.textContent = "CARGANDO...";
    
    try {
        const data = await supabaseFetch(`preguntas?test_id=eq.${radioSelected.value}&order=numero_orden.asc`);
        
        if (!data || data.length === 0) {
            alert("No hay preguntas en este test.");
            btn.textContent = "COMENZAR TEST";
            return;
        }

        preguntasTest = data.map(p => ({
            enunciado: p.enunciado,
            opciones: { a: p.opcion_a, b: p.opcion_b, c: p.opcion_c, d: p.opcion_d },
            correcta: (p.correcta || 'a').toLowerCase().trim(),
            feedback: p.feedback || "Sin explicación."
        }));
        
        modoEstudio = document.querySelector('input[name="modo"]:checked').value === 'estudio';

        // Gestión de pantallas (IDs exactos de tu HTML)
        document.getElementById('pantalla-inicio').classList.add('hidden');
        document.querySelector('.footer-controls').classList.add('hidden');
        document.getElementById('pantalla-test').classList.remove('hidden');

        preguntaActualIndex = 0;
        puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
        mostrarPregunta();
    } catch (e) {
        alert("Error de conexión");
    } finally {
        btn.textContent = "COMENZAR TEST";
    }
};

// 4. MOSTRAR PREGUNTA
function mostrarPregunta() {
    esDudada = false;
    document.getElementById('btnArriesgando').classList.remove('active');
    document.getElementById('feedback-area').classList.add('hidden');
    
    const p = preguntasTest[preguntaActualIndex];
    document.getElementById('pregunta-numero').textContent = `Pregunta ${preguntaActualIndex + 1} de ${preguntasTest.length}`;
    document.getElementById('pregunta-texto').textContent = p.enunciado;
    
    const container = document.getElementById('opciones-container');
    container.innerHTML = "";
    
    const btnAccion = document.getElementById('btnAccion');
    btnAccion.disabled = true;
    btnAccion.textContent = "CORREGIR";

    Object.entries(p.opciones).forEach(([letra, texto]) => {
        if (!texto) return;
        const btnOpc = document.createElement('button');
        btnOpc.className = 'opcion';
        btnOpc.innerHTML = `<span class="letra">${letra.toUpperCase()}</span> ${texto}`;
        btnOpc.onclick = () => {
            document.querySelectorAll('.opcion').forEach(b => b.classList.remove('selected'));
            btnOpc.classList.add('selected');
            btnAccion.disabled = false;
            // Al hacer clic en una opción, el botón corregir apunta a procesar esa letra
            btnAccion.onclick = () => procesarRespuesta(letra);
        };
        container.appendChild(btnOpc);
    });
}

// 5. PROCESAR RESPUESTA
function procesarRespuesta(seleccionada) {
    const p = preguntasTest[preguntaActualIndex];
    const correcta = p.correcta;
    
    if (esDudada) puntuacion.arriesgadas++;
    if (seleccionada === correcta) puntuacion.aciertos++;
    else puntuacion.fallos++;

    const btnAccion = document.getElementById('btnAccion');

    if (modoEstudio) {
        document.querySelectorAll('.opcion').forEach(btn => {
            const letraBtn = btn.querySelector('.letra').textContent.toLowerCase();
            if (letraBtn === correcta) btn.style.background = "#28a745"; 
            if (letraBtn === seleccionada && seleccionada !== correcta) btn.style.background = "#dc3545";
            btn.style.pointerEvents = "none"; 
        });
        document.getElementById('feedback-texto').textContent = p.feedback;
        document.getElementById('feedback-area').classList.remove('hidden');
        btnAccion.textContent = "SIGUIENTE";
        btnAccion.onclick = () => siguiente();
    } else {
        siguiente();
    }
}

function siguiente() {
    preguntaActualIndex++;
    if (preguntaActualIndex < preguntasTest.length) {
        mostrarPregunta();
    } else {
        finalizarTest();
    }
}

// 6. RESULTADOS (Cápsulas de style.css)
function finalizarTest() {
    document.getElementById('pantalla-test').classList.add('hidden');
    document.getElementById('pantalla-resultados').classList.remove('hidden');
    
    const total = preguntasTest.length;
    const nulas = total - (puntuacion.aciertos + puntuacion.fallos);
    const nota = ((puntuacion.aciertos - (puntuacion.fallos * 0.33)) * 10 / total).toFixed(2);

    document.getElementById('contenedor-stats').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card card-aciertos"><h3>${puntuacion.aciertos}</h3><p>ACIERTOS</p></div>
            <div class="stat-card card-fallos"><h3>${puntuacion.fallos}</h3><p>FALLOS</p></div>
            <div class="stat-card card-nulas"><h3>${nulas}</h3><p>NULAS</p></div>
            <div class="stat-card card-arriesgadas"><h3>${puntuacion.arriesgadas}</h3><p>DUDADAS</p></div>
        </div>
        <div class="nota-final">NOTA FINAL: ${nota}</div>
    `;
    
    document.getElementById('contenedor-boton-volver').innerHTML = `
        <button class="btn-volver" onclick="location.reload()">VOLVER AL INICIO</button>
    `;
}

// 7. EVENTOS ADICIONALES
document.getElementById('btnArriesgando').onclick = function() {
    esDudada = !esDudada;
    this.classList.toggle('active', esDudada);
};

// Botón de salir (basado en tu clase btn-exit)
const exitBtn = document.querySelector('.btn-exit');
if(exitBtn) exitBtn.onclick = () => location.reload();

window.onload = cargarMenuDinamico;
