// 1. CONFIGURACIÓN SUPABASE
const SUPABASE_URL = "https://ogpprghtohbumqihzxwt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncHByZ2h0b2hidW1xaWh6eHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMTA5MDMsImV4cCI6MjA4MjU4NjkwM30.TDkm0NHDNh0gec26s6gnvHH_euJPuGLqX5nghMXy2wI";

let preguntasTest = [];
let preguntaActualIndex = 0;
let puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
let modoEstudio = true;
let esDudada = false;

// Función para hablar con Supabase vía REST
async function supabaseFetch(endpoint) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
    });
    if (!res.ok) throw new Error(`Error Supabase: ${res.statusText}`);
    return await res.json();
}

// 2. CARGA DEL MENÚ (Respeta tus listas B1, B2, B3, B4 y oficiales)
async function cargarMenuDinamico() {
    try {
        const data = await supabaseFetch("tests?select=id,nombre,bloque_id&visible=eq.true");
        
        ['lista-B1', 'lista-B2', 'lista-B3', 'lista-B4', 'lista-oficiales'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = "";
        });

        data.forEach(t => {
            const label = document.createElement('label');
            label.className = 'test-item';
            label.innerHTML = `<input type="radio" name="test-select" value="${t.id}"> <span>${t.nombre}</span>`;
            
            // Mapeo por bloque_id
            const contenedorId = t.bloque_id === 5 ? 'lista-oficiales' : `lista-B${t.bloque_id}`;
            const contenedor = document.getElementById(contenedorId);
            if (contenedor) contenedor.appendChild(label);
        });
    } catch (e) { console.error("Error cargando menú:", e); }
}

// 3. COMENZAR TEST (Conexión a tabla preguntas corregida)
document.getElementById('btnComenzar').onclick = async () => {
    const sel = document.querySelector('input[name="test-select"]:checked');
    if (!sel) return alert("Selecciona un test 🚀");
    
    const btn = document.getElementById('btnComenzar');
    const textoOriginal = btn.textContent;
    btn.textContent = "CARGANDO...";
    
    const testId = parseInt(sel.value); // Aseguramos que sea número para Postgres
    
    try {
        const data = await supabaseFetch(`preguntas?test_id=eq.${testId}&order=numero_orden.asc`);
        
        if (!data || data.length === 0) {
            alert("Este test no tiene preguntas cargadas todavía.");
            btn.textContent = textoOriginal;
            return;
        }

        preguntasTest = data.map(p => ({
            enunciado: p.enunciado,
            opciones: { a: p.opcion_a, b: p.opcion_b, c: p.opcion_c, d: p.opcion_d },
            correcta: p.correcta ? p.correcta.toLowerCase().trim() : 'a',
            feedback: p.feedback || "Sin explicación adicional."
        }));
        
        const modoSeleccionado = document.querySelector('input[name="modo"]:checked');
        modoEstudio = modoSeleccionado ? modoSeleccionado.value === 'estudio' : true;

        document.getElementById('pantalla-inicio').classList.add('hidden');
        document.getElementById('pantalla-test').classList.remove('hidden');

        preguntaActualIndex = 0;
        puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
        mostrarPregunta();
    } catch (e) {
        console.error(e);
        alert("Error al obtener las preguntas.");
    } finally {
        btn.textContent = textoOriginal;
    }
};

// 4. MOSTRAR PREGUNTA (Toda tu lógica visual intacta)
function mostrarPregunta() {
    esDudada = false;
    document.getElementById('btnArriesgando').classList.remove('active');
    document.getElementById('feedback-area').classList.add('hidden');
    
    const p = preguntasTest[preguntaActualIndex];
    document.getElementById('pregunta-numero').textContent = `Pregunta ${preguntaActualIndex + 1} de ${preguntasTest.length}`;
    document.getElementById('pregunta-texto').textContent = p.enunciado;
    
    const container = document.getElementById('opciones-container');
    container.innerHTML = "";
    document.getElementById('btnAccion').disabled = true;
    document.getElementById('btnAccion').textContent = "CORREGIR";

    Object.entries(p.opciones).forEach(([letra, texto]) => {
        if (!texto) return;
        const btn = document.createElement('button');
        btn.className = 'opcion';
        btn.dataset.letra = letra;
        btn.innerHTML = `<span class="letra">${letra.toUpperCase()}</span> ${texto}`;
        btn.onclick = () => {
            document.querySelectorAll('.opcion').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('btnAccion').disabled = false;
            document.getElementById('btnAccion').onclick = () => procesarRespuesta(letra);
        };
        container.appendChild(btn);
    });
}

// 5. BOTÓN ARRIESGANDO
document.getElementById('btnArriesgando').onclick = function() {
    esDudada = !esDudada;
    this.classList.toggle('active', esDudada);
};

// 6. PROCESAR RESPUESTA
function procesarRespuesta(seleccionada) {
    const p = preguntasTest[preguntaActualIndex];
    const correcta = p.correcta.toLowerCase().trim();
    
    if (esDudada) puntuacion.arriesgadas++;
    if (seleccionada === correcta) puntuacion.aciertos++;
    else puntuacion.fallos++;

    if (modoEstudio) {
        document.querySelectorAll('.opcion').forEach(btn => {
            const l = btn.dataset.letra; 
            if (l === correcta) btn.style.background = "#28a745"; 
            if (l === seleccionada && seleccionada !== correcta) btn.style.background = "#dc3545";
            btn.disabled = true; 
        });
        document.getElementById('feedback-texto').textContent = p.feedback;
        document.getElementById('feedback-area').classList.remove('hidden');
        document.getElementById('btnAccion').textContent = "SIGUIENTE";
        document.getElementById('btnAccion').onclick = () => siguiente();
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

// 7. FINALIZAR TEST (Cápsulas de resultados originales)
function finalizarTest() {
    document.getElementById('pantalla-test').classList.add('hidden');
    document.getElementById('pantalla-resultados').classList.remove('hidden');
    
    const total = preguntasTest.length;
    const nulas = total - (puntuacion.aciertos + puntuacion.fallos);
    const nota = ((puntuacion.aciertos - (puntuacion.fallos * 0.33)) * 10 / total).toFixed(2);

    const statsHTML = `
        <div class="stats-grid">
            <div class="stat-card card-aciertos"><h3>${puntuacion.aciertos}</h3><p>ACIERTOS</p></div>
            <div class="stat-card card-fallos"><h3>${puntuacion.fallos}</h3><p>FALLOS</p></div>
            <div class="stat-card card-nulas"><h3>${nulas}</h3><p>NULAS</p></div>
            <div class="stat-card card-arriesgadas"><h3>${puntuacion.arriesgadas}</h3><p>DUDADAS</p></div>
        </div>
        <div class="nota-final">NOTA FINAL: ${nota}</div>
    `;
    
    document.getElementById('contenedor-stats').innerHTML = statsHTML;
    document.getElementById('contenedor-boton-volver').innerHTML = `
        <button class="btn-volver" onclick="location.reload()">VOLVER AL INICIO</button>
    `;
}

window.onload = cargarMenuDinamico;
