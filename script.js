// 1. CONFIGURACIÓN
const SB_URL = "https://ogpprghtohbumqihzxwt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncHByZ2h0b2hidW1xaWh6eHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMTA5MDMsImV4cCI6MjA4MjU4NjkwM30.TDkm0NHDNh0gec26s6gnvHH_euJPuGLqX5nghMXy2wI";

let preguntasTest = [];
let preguntaActualIndex = 0;
let puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
let modoEstudio = true;
let esDudada = false;

// 2. CARGA DEL MENÚ
async function cargarMenuDinamico() {
    try {
        const res = await fetch(`${SB_URL}/rest/v1/tests?select=*&visible=eq.true&order=id.asc`, {
            headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` }
        });
        const tests = await res.json();
        
        ['lista-B1', 'lista-B2', 'lista-B3', 'lista-B4', 'lista-oficiales'].forEach(id => {
            if(document.getElementById(id)) document.getElementById(id).innerHTML = "";
        });

        tests.forEach(t => {
            const containerId = t.bloque_id === 5 ? 'lista-oficiales' : `lista-B${t.bloque_id}`;
            const contenedor = document.getElementById(containerId);
            if (contenedor) {
                const label = document.createElement('label');
                label.className = 'test-item';
                label.innerHTML = `<input type="radio" name="test-select" value="${t.id}"> <span>${t.nombre}</span>`;
                contenedor.appendChild(label);
            }
        });
    } catch (e) { console.error("Error Menú:", e); }
}

// 3. COMENZAR TEST (CON DIAGNÓSTICO)
document.getElementById('btnComenzar').onclick = async () => {
    const radio = document.querySelector('input[name="test-select"]:checked');
    if (!radio) return alert("Selecciona un test 🚀");
    
    const btn = document.getElementById('btnComenzar');
    btn.textContent = "CARGANDO...";
    
    try {
        // Petición a Supabase
        const response = await fetch(`${SB_URL}/rest/v1/preguntas?test_id=eq.${radio.value}&order=numero_orden.asc`, {
            headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Error DB: ${errorData.message || response.statusText}`);
        }

        const data = await response.json();
        if (data.length === 0) throw new Error("El test seleccionado no tiene preguntas cargadas.");

        // Mapeo manual de campos (basado en tu esquema bpchar/text)
        preguntasTest = data.map(p => ({
            enunciado: p.enunciado,
            opciones: { a: p.opcion_a, b: p.opcion_b, c: p.opcion_c, d: p.opcion_d },
            correcta: (p.correcta || 'A').toLowerCase().trim(),
            feedback: p.feedback || "Sin explicación."
        }));
        
        modoEstudio = document.querySelector('input[name="modo"]:checked').value === 'estudio';

        // Cambio de pantallas - Usando display directo para asegurar
        document.getElementById('pantalla-inicio').style.display = 'none';
        document.querySelector('.footer-controls').style.display = 'none';
        
        const pTest = document.getElementById('pantalla-test');
        pTest.classList.remove('hidden');
        pTest.style.display = 'block';

        preguntaActualIndex = 0;
        puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
        mostrarPregunta();

    } catch (err) {
        alert("¡ATENCIÓN! " + err.message);
        console.error(err);
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
            btnAccion.onclick = () => {
                // Lógica de corrección
                if (esDudada) puntuacion.arriesgadas++;
                if (letra === p.correcta) puntuacion.aciertos++;
                else puntuacion.fallos++;

                if (modoEstudio) {
                    document.querySelectorAll('.opcion').forEach(b => {
                        const l = b.querySelector('.letra').textContent.toLowerCase();
                        if (l === p.correcta) b.style.background = "#28a745";
                        else if (l === letra) b.style.background = "#dc3545";
                        b.style.pointerEvents = "none";
                    });
                    document.getElementById('feedback-texto').textContent = p.feedback;
                    document.getElementById('feedback-area').classList.remove('hidden');
                    btnAccion.textContent = "SIGUIENTE";
                    btnAccion.onclick = siguiente;
                } else {
                    siguiente();
                }
            };
        };
        container.appendChild(btnOpc);
    });
}

function siguiente() {
    preguntaActualIndex++;
    if (preguntaActualIndex < preguntasTest.length) mostrarPregunta();
    else finalizar();
}

function finalizar() {
    document.getElementById('pantalla-test').style.display = 'none';
    const res = document.getElementById('pantalla-resultados');
    res.classList.remove('hidden');
    res.style.display = 'block';
    
    const total = preguntasTest.length;
    const nota = ((puntuacion.aciertos - (puntuacion.fallos * 0.33)) * 10 / total).toFixed(2);

    document.getElementById('contenedor-stats').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card card-aciertos"><h3>${puntuacion.aciertos}</h3><p>ACIERTOS</p></div>
            <div class="stat-card card-fallos"><h3>${puntuacion.fallos}</h3><p>FALLOS</p></div>
            <div class="stat-card card-arriesgadas"><h3>${puntuacion.arriesgadas}</h3><p>DUDADAS</p></div>
        </div>
        <p style="text-align:center; font-size:1.5rem; margin-top:20px;">NOTA: ${nota}</p>
    `;
    document.getElementById('contenedor-boton-volver').innerHTML = `<button class="btn-volver" onclick="location.reload()">INICIO</button>`;
}

// 5. EVENTOS
document.getElementById('btnArriesgando').onclick = function() {
    esDudada = !esDudada;
    this.classList.toggle('active', esDudada);
};

const exit = document.querySelector('.btn-exit');
if (exit) exit.onclick = () => location.reload();

window.onload = cargarMenuDinamico;
