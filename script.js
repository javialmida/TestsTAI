// 1. CONFIGURACIÓN SUPABASE
const SB_URL = "https://ogpprghtohbumqihzxwt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncHByZ2h0b2hidW1xaWh6eHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMTA5MDMsImV4cCI6MjA4MjU4NjkwM30.TDkm0NHDNh0gec26s6gnvHH_euJPuGLqX5nghMXy2wI";

let preguntasTest = [];
let preguntaActualIndex = 0;
let puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
let modoEstudio = true;
let esDudada = false;

// 2. FUNCIÓN DE CARGA DEL MENÚ
async function cargarMenu() {
    try {
        const r = await fetch(`${SB_URL}/rest/v1/tests?select=id,nombre,bloque_id&visible=eq.true&order=id.asc`, {
            headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` }
        });
        const tests = await r.json();
        
        const listas = ['lista-B1', 'lista-B2', 'lista-B3', 'lista-B4', 'lista-oficiales'];
        listas.forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerHTML = ""; });

        tests.forEach(t => {
            const containerId = t.bloque_id === 5 ? 'lista-oficiales' : `lista-B${t.bloque_id}`;
            const contenedor = document.getElementById(containerId);
            if (contenedor) {
                const item = document.createElement('label');
                item.className = 'test-item';
                item.innerHTML = `<input type="radio" name="test-select" value="${t.id}"> <span>${t.nombre}</span>`;
                contenedor.appendChild(item);
            }
        });
    } catch (e) { console.error("Error inicial:", e); }
}

// 3. COMENZAR TEST (CIRUGÍA AQUÍ)
document.getElementById('btnComenzar').onclick = async () => {
    const seleccionado = document.querySelector('input[name="test-select"]:checked');
    if (!seleccionado) return alert("Selecciona un test en el menú 🚀");
    
    const btn = document.getElementById('btnComenzar');
    btn.textContent = "CONECTANDO...";

    try {
        const res = await fetch(`${SB_URL}/rest/v1/preguntas?test_id=eq.${seleccionado.value}&order=numero_orden.asc`, {
            headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` }
        });
        const data = await res.json();

        if (!data || data.length === 0) throw new Error("La base de datos devolvió 0 preguntas.");

        preguntasTest = data.map(p => ({
            enunciado: p.enunciado,
            opciones: { a: p.opcion_a, b: p.opcion_b, c: p.opcion_c, d: p.opcion_d },
            correcta: (p.correcta || 'a').toLowerCase().trim(),
            feedback: p.feedback || "Sin explicación disponible."
        }));

        modoEstudio = document.querySelector('input[name="modo"]:checked').value === 'estudio';

        // Gestión manual de visibilidad (Sin classList para evitar fallos de CSS)
        document.getElementById('pantalla-inicio').style.display = 'none';
        document.querySelector('.footer-controls').style.display = 'none';
        document.getElementById('pantalla-test').style.display = 'block';
        document.getElementById('pantalla-test').classList.remove('hidden');

        preguntaActualIndex = 0;
        puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
        mostrarPregunta();
    } catch (e) {
        alert("FALLO CRÍTICO: " + e.message);
        console.error(e);
    } finally {
        btn.textContent = "COMENZAR TEST";
    }
};

// 4. MOSTRAR PREGUNTA (IDs EXACTOS)
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
            btnAccion.onclick = () => corregir(letra);
        };
        container.appendChild(btnOpc);
    });
}

function corregir(seleccionada) {
    const p = preguntasTest[preguntaActualIndex];
    if (esDudada) puntuacion.arriesgadas++;
    
    if (seleccionada === p.correcta) puntuacion.aciertos++;
    else puntuacion.fallos++;

    if (modoEstudio) {
        document.querySelectorAll('.opcion').forEach(btn => {
            const letra = btn.querySelector('.letra').textContent.toLowerCase();
            if (letra === p.correcta) btn.style.background = "#28a745";
            else if (letra === seleccionada) btn.style.background = "#dc3545";
            btn.style.pointerEvents = "none";
        });
        document.getElementById('feedback-texto').textContent = p.feedback;
        document.getElementById('feedback-area').classList.remove('hidden');
        document.getElementById('btnAccion').textContent = "SIGUIENTE";
        document.getElementById('btnAccion').onclick = irASiguiente;
    } else {
        irASiguiente();
    }
}

function irASiguiente() {
    preguntaActualIndex++;
    if (preguntaActualIndex < preguntasTest.length) mostrarPregunta();
    else finalizar();
}

function finalizar() {
    document.getElementById('pantalla-test').style.display = 'none';
    document.getElementById('pantalla-resultados').classList.remove('hidden');
    
    const total = preguntasTest.length;
    const nota = ((puntuacion.aciertos - (puntuacion.fallos * 0.33)) * 10 / total).toFixed(2);

    document.getElementById('contenedor-stats').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card card-aciertos"><h3>${puntuacion.aciertos}</h3><p>ACIERTOS</p></div>
            <div class="stat-card card-fallos"><h3>${puntuacion.fallos}</h3><p>FALLOS</p></div>
            <div class="stat-card card-arriesgadas"><h3>${puntuacion.arriesgadas}</h3><p>DUDADAS</p></div>
        </div>
        <div class="nota-final">NOTA FINAL: ${nota}</div>
    `;
    document.getElementById('contenedor-boton-volver').innerHTML = `<button class="btn-main" onclick="location.reload()">INICIO</button>`;
}

// 5. EVENTOS VARIOS
document.getElementById('btnArriesgando').onclick = function() {
    esDudada = !esDudada;
    this.classList.toggle('active', esDudada);
};

const btnS = document.querySelector('.btn-exit');
if(btnS) btnS.onclick = () => location.reload();

window.onload = cargarMenu;
