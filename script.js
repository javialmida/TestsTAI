// 1. CONFIGURACIÓN SUPABASE
const SB_URL = "https://ogpprghtohbumqihzxwt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncHByZ2h0b2hidW1xaWh6eHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMTA5MDMsImV4cCI6MjA4MjU4NjkwM30.TDkm0NHDNh0gec26s6gnvHH_euJPuGLqX5nghMXy2wI";

let preguntasTest = [];
let respuestasUsuario = []; // Para el informe final
let preguntaActualIndex = 0;
let puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
let modoEstudio = true;
let esDudada = false;

// Conector
async function supabaseFetch(endpoint) {
    const res = await fetch(`${SB_URL}/rest/v1/${endpoint}`, {
        headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" }
    });
    return await res.json();
}

// 2. CARGA DEL MENÚ
async function cargarMenuDinamico() {
    try {
        const data = await supabaseFetch("tests?select=*&visible=eq.true&order=id.asc");
        ['lista-B1', 'lista-B2', 'lista-B3', 'lista-B4', 'lista-oficiales'].forEach(id => {
            if (document.getElementById(id)) document.getElementById(id).innerHTML = "";
        });
        data.forEach(t => {
            const label = document.createElement('label');
            label.className = 'test-item';
            label.innerHTML = `<input type="radio" name="test-select" value="${t.id}" id="radio-test-${t.id}"> <span>${t.nombre}</span>`;
            const cId = t.bloque_id === 5 ? 'lista-oficiales' : `lista-B${t.bloque_id}`;
            if (document.getElementById(cId)) document.getElementById(cId).appendChild(label);
        });
    } catch (e) { console.error(e); }
}

// 3. COMENZAR TEST
document.getElementById('btnComenzar').onclick = async () => {
    const sel = document.querySelector('input[name="test-select"]:checked');
    if (!sel) return alert("Selecciona un test 🚀");
    
    document.getElementById('btnComenzar').textContent = "CARGANDO...";
    
    try {
        const data = await supabaseFetch(`preguntas?test_id=eq.${sel.value}&order=numero_orden.asc`);
        preguntasTest = data.map(p => ({
            enunciado: p.enunciado,
            opciones: { a: p.opcion_a, b: p.opcion_b, c: p.opcion_c, d: p.opcion_d },
            correcta: (p.correcta || 'a').toLowerCase().trim(),
            feedback: p.feedback || "Sin explicación adicional."
        }));
        
        modoEstudio = document.querySelector('input[name="modo"]:checked').value === 'estudio';
        respuestasUsuario = [];
        preguntaActualIndex = 0;
        puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };

        document.getElementById('pantalla-inicio').classList.add('hidden');
        document.querySelector('.footer-controls').classList.add('hidden');
        document.getElementById('pantalla-test').classList.remove('hidden');

        mostrarPregunta();
    } catch (e) { alert("Error al cargar"); }
    document.getElementById('btnComenzar').textContent = "COMENZAR TEST";
};

// 4. MOSTRAR PREGUNTA
function mostrarPregunta() {
    esDudada = false;
    document.getElementById('btnArriesgando').classList.remove('active');
    document.getElementById('feedback-area').classList.add('hidden');
    
    const p = preguntasTest[preguntaActualIndex];
    document.getElementById('contador-preguntas').textContent = `Pregunta ${preguntaActualIndex + 1}/${preguntasTest.length}`;
    document.getElementById('enunciado').textContent = p.enunciado;
    
    const container = document.getElementById('opciones-lista');
    container.innerHTML = "";
    document.getElementById('btnAccion').disabled = true;
    document.getElementById('btnAccion').textContent = "CORREGIR";

    Object.entries(p.opciones).forEach(([letra, texto]) => {
        if (!texto) return;
        const btn = document.createElement('button');
        btn.className = 'opcion';
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

function procesarRespuesta(seleccionada) {
    const p = preguntasTest[preguntaActualIndex];
    const esCorrecta = seleccionada === p.correcta;
    
    // Guardamos para el informe final
    respuestasUsuario.push({
        pregunta: p.enunciado,
        seleccionada: seleccionada,
        correcta: p.correcta,
        esCorrecta: esCorrecta,
        feedback: p.feedback,
        dudada: esDudada,
        opciones: p.opciones
    });

    if (esDudada) puntuacion.arriesgadas++;
    if (esCorrecta) puntuacion.aciertos++; else puntuacion.fallos++;

    if (modoEstudio) {
        document.querySelectorAll('.opcion').forEach(btn => {
            const l = btn.querySelector('.letra').textContent.toLowerCase();
            if (l === p.correcta) btn.style.background = "#28a745"; 
            if (l === seleccionada && !esCorrecta) btn.style.background = "#dc3545";
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
    else finalizarTest();
}

// 5. FINALIZAR Y GENERAR INFORME DETALLADO
function finalizarTest() {
    document.getElementById('pantalla-test').classList.add('hidden');
    document.getElementById('pantalla-resultados').classList.remove('hidden');
    
    const total = preguntasTest.length;
    const nulas = total - (puntuacion.aciertos + puntuacion.fallos);
    const nota = ((puntuacion.aciertos - (puntuacion.fallos * 0.33)) * 10 / total).toFixed(2);

    // Stats con tus clases de CSS
    document.getElementById('contenedor-stats').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card card-aciertos"><h3>${puntuacion.aciertos}</h3><p>ACIERTOS</p></div>
            <div class="stat-card card-fallos"><h3>${puntuacion.fallos}</h3><p>FALLOS</p></div>
            <div class="stat-card card-nulas"><h3>${nulas}</h3><p>NULAS</p></div>
            <div class="stat-card card-arriesgadas"><h3>${puntuacion.arriesgadas}</h3><p>DUDADAS</p></div>
        </div>
        <div class="nota-final">NOTA FINAL: ${nota}</div>
    `;

    // Generar Informe de fallos y dudas
    const informeContenedor = document.getElementById('contenedor-informe');
    informeContenedor.innerHTML = "";
    
    const fallosODudas = respuestasUsuario.filter(r => !r.esCorrecta || r.dudada);
    
    if (fallosODudas.length > 0) {
        const titulo = document.createElement('h3');
        titulo.textContent = "REVISIÓN DE FALLOS Y DUDAS";
        titulo.style.color = "#9c4dcc";
        titulo.style.marginTop = "30px";
        informeContenedor.appendChild(titulo);

        fallosODudas.forEach((r, idx) => {
            const item = document.createElement('div');
            item.className = 'revision-item';
            item.style.borderLeft = r.esCorrecta ? "4px solid #f1c40f" : "4px solid #dc3545";
            item.innerHTML = `
                <p><strong>#${idx + 1}: ${r.pregunta}</strong></p>
                <p style="color: ${r.esCorrecta ? '#28a745' : '#dc3545'}">Tu respuesta: ${r.seleccionada.toUpperCase()} - ${r.opciones[r.seleccionada]}</p>
                ${!r.esCorrecta ? `<p style="color: #28a745">Correcta: ${r.correcta.toUpperCase()} - ${r.opciones[r.correcta]}</p>` : ''}
                <div class="feedback-box" style="background: #222; padding: 10px; border-radius: 5px; margin-top: 5px;">
                    <small>💡 ${r.feedback}</small>
                </div>
            `;
            informeContenedor.appendChild(item);
        });
    }

    document.getElementById('contenedor-boton-volver').innerHTML = `<button class="btn-volver" onclick="location.reload()">VOLVER AL INICIO</button>`;
}

// 6. ESTADÍSTICAS CON ENLACE
document.getElementById('btnEstadisticas').onclick = () => {
    alert("Función de persistencia de estadísticas en desarrollo. \nPero aquí tienes el acceso rápido:");
    // Ejemplo de cómo los títulos de los tests pueden ser enlaces:
    // Al cargar el menú, podrías llamar a una función que guarde el ID.
};

// Acceso rápido desde el informe: Si el usuario pulsa en el nombre de un test (lo implementamos en el menú)
function irATest(id) {
    const radio = document.getElementById(`radio-test-${id}`);
    if (radio) {
        radio.checked = true;
        radio.scrollIntoView({ behavior: 'smooth' });
    }
}

document.getElementById('btnArriesgando').onclick = function() {
    esDudada = !esDudada;
    this.classList.toggle('active', esDudada);
};
document.getElementById('btnSalir').onclick = () => location.reload();

window.onload = cargarMenuDinamico;
