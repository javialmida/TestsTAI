// 1. CONFIGURACIÓN SUPABASE
const SB_URL = "https://ogpprghtohbumqihzxwt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncHByZ2h0b2hidW1xaWh6eHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMTA5MDMsImV4cCI6MjA4MjU4NjkwM30.TDkm0NHDNh0gec26s6gnvHH_euJPuGLqX5nghMXy2wI";

let preguntasTest = [];
let preguntaActualIndex = 0;
let puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
let modoEstudio = true;
let esDudada = false;

// Conexión directa
async function supabaseFetch(endpoint) {
    const res = await fetch(`${SB_URL}/rest/v1/${endpoint}`, {
        headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" }
    });
    if (!res.ok) throw new Error("Error de conexión con la base de datos");
    return await res.json();
}

// 2. CARGA DEL MENÚ (IDs exactos: lista-B1, lista-B2...)
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
            const cId = t.bloque_id === 5 ? 'lista-oficiales' : `lista-B${t.bloque_id}`;
            const contenedor = document.getElementById(cId);
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
        const data = await supabaseFetch(`preguntas?test_id=eq.${radio.value}&order=numero_orden.asc`);
        if (!data || data.length === 0) throw new Error("Test sin preguntas");

        preguntasTest = data.map(p => ({
            enunciado: p.enunciado,
            opciones: { a: p.opcion_a, b: p.opcion_b, c: p.opcion_c, d: p.opcion_d },
            correcta: (p.correcta || 'a').toLowerCase().trim(),
            feedback: p.feedback || "Sin explicación."
        }));
        
        modoEstudio = document.querySelector('input[name="modo"]:checked').value === 'estudio';

        // GESTIÓN DE PANTALLAS (Fiel a tu index.html)
        document.getElementById('pantalla-inicio').classList.add('hidden');
        document.querySelector('footer.footer-controls').classList.add('hidden'); // Ocultar controles inicio
        document.getElementById('pantalla-test').classList.remove('hidden');

        preguntaActualIndex = 0;
        puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
        mostrarPregunta();
    } catch (e) { alert(e.message); }
    finally { btn.textContent = "COMENZAR TEST"; }
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
            btnAccion.onclick = () => procesarRespuesta(letra);
        };
        container.appendChild(btnOpc);
    });
}

// 5. RESPUESTA
function procesarRespuesta(seleccionada) {
    const p = preguntasTest[preguntaActualIndex];
    if (esDudada) puntuacion.arriesgadas++;
    if (seleccionada === p.correcta) puntuacion.aciertos++;
    else puntuacion.fallos++;

    const btnAccion = document.getElementById('btnAccion');

    if (modoEstudio) {
        document.querySelectorAll('.opcion').forEach(btn => {
            const letraBtn = btn.querySelector('.letra').textContent.toLowerCase();
            if (letraBtn === p.correcta) btn.style.background = "#28a745"; 
            if (letraBtn === seleccionada && seleccionada !== p.correcta) btn.style.background = "#dc3545";
            btn.style.pointerEvents = "none"; 
        });
        document.getElementById('feedback-texto').textContent = p.feedback;
        document.getElementById('feedback-area').classList.remove('hidden');
        btnAccion.textContent = "SIGUIENTE";
        btnAccion.onclick = () => {
            preguntaActualIndex++;
            if (preguntaActualIndex < preguntasTest.length) mostrarPregunta();
            else finalizar();
        };
    } else {
        preguntaActualIndex++;
        if (preguntaActualIndex < preguntasTest.length) mostrarPregunta();
        else finalizar();
    }
}

// 6. RESULTADOS
function finalizar() {
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
    document.getElementById('contenedor-boton-volver').innerHTML = `<button class="btn-volver" onclick="location.reload()">VOLVER AL INICIO</button>`;
}

// 7. EVENTOS
document.getElementById('btnArriesgando').onclick = function() {
    esDudada = !esDudada;
    this.classList.toggle('active', esDudada);
};

// Botón SALIR (Usando el ID que le hemos dado en la cabecera del test)
const btnS = document.querySelector('.btn-exit');
if(btnS) btnS.onclick = () => location.reload();

window.onload = cargarMenuDinamico;
