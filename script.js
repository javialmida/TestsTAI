// 1. CONFIGURACIÓN SUPABASE
const SUPABASE_URL = "https://ogpprghtohbumqihzxwt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncHByZ2h0b2hidW1xaWh6eHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMTA5MDMsImV4cCI6MjA4MjU4NjkwM30.TDkm0NHDNh0gec26s6gnvHH_euJPuGLqX5nghMXy2wI";

let preguntasTest = [];
let preguntaActualIndex = 0;
let puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
let modoEstudio = true;
let esDudada = false;

// Conector directo
async function supabaseFetch(endpoint) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        method: 'GET',
        headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json"
        }
    });
    if (!response.ok) throw new Error("Error en Supabase");
    return await response.json();
}

// 2. CARGA DEL MENÚ
async function cargarMenuDinamico() {
    try {
        const data = await supabaseFetch("tests?select=id,nombre,bloque_id&visible=eq.true&order=id.asc");
        
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
    const radio = document.querySelector('input[name="test-select"]:checked');
    if (!radio) return alert("Selecciona un test 🚀");
    
    const btn = document.getElementById('btnComenzar');
    btn.textContent = "CARGANDO...";
    
    try {
        // Petición a la tabla 'preguntas'
        const data = await supabaseFetch(`preguntas?test_id=eq.${radio.value}&order=numero_orden.asc`);
        
        if (!data || data.length === 0) {
            alert("No hay preguntas en este test.");
            btn.textContent = "COMENZAR TEST";
            return;
        }

        preguntasTest = data.map(p => ({
            enunciado: p.enunciado || "Sin enunciado",
            opciones: { a: p.opcion_a, b: p.opcion_b, c: p.opcion_c, d: p.opcion_d },
            correcta: (p.correcta || 'a').toLowerCase().trim(),
            feedback: p.feedback || "Sin explicación."
        }));
        
        // Detectar modo
        const modoEl = document.querySelector('input[name="modo"]:checked');
        modoEstudio = modoEl ? modoEl.value === 'estudio' : true;

        // --- CAMBIO DE PANTALLAS (IDs EXACTOS) ---
        document.getElementById('pantalla-inicio').classList.add('hidden');
        // Ocultamos el footer entero para que desaparezca el botón comenzar
        document.querySelector('footer.footer-controls').classList.add('hidden'); 
        document.getElementById('pantalla-test').classList.remove('hidden');

        preguntaActualIndex = 0;
        puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
        mostrarPregunta();
    } catch (e) {
        alert("Error al cargar datos");
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
            // Guardamos la función en el botón principal
            btnAccion.onclick = () => procesarRespuesta(letra);
        };
        container.appendChild(btnOpc);
    });
}

// 5. RESPUESTA
function procesarRespuesta(seleccionada) {
    const p = preguntasTest[preguntaActualIndex];
    const correcta = p.correcta;
    
    if (esDudada) puntuacion.arriesgadas++;
    if (seleccionada === correcta) puntuacion.aciertos++;
    else puntuacion.fallos++;

    const btnAccion = document.getElementById('btnAccion');

    if (modoEstudio) {
        document.querySelectorAll('.opcion').forEach(btn => {
            const l = btn.querySelector('.letra').textContent.toLowerCase();
            if (l === correcta) btn.style.background = "#28a745"; 
            if (l === seleccionada && seleccionada !== correcta) btn.style.background = "#dc3545";
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

// 6. FINALIZAR
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

// 7. OTROS EVENTOS (Arriesgar y Salir)
document.getElementById('btnArriesgando').onclick = function() {
    esDudada = !esDudada;
    this.classList.toggle('active', esDudada);
};

// Buscamos el botón de salir por su clase .btn-exit
const btnExit = document.querySelector('.btn-exit');
if (btnExit) btnExit.onclick = () => location.reload();

window.onload = cargarMenuDinamico;
