// 1. CONFIGURACIÓN
const URL_SCRIPT = "https://script.google.com/macros/s/AKfycbwfB5sZE-q22Ha5uvvYM89wFyu74RfVyWM9k2ZA0sg7v9wGtNkCPVr1qM-iPY4UfmNd/exec";

let preguntasTest = [];
let preguntaActualIndex = 0;
let puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
let modoEstudio = true;
let esDudada = false;

// 2. CARGA DEL MENÚ
async function cargarMenuDinamico() {
    try {
        const res = await fetch(`${URL_SCRIPT}?accion=obtenerListaTests`);
        const tests = await res.json();
        
        ['lista-B1', 'lista-B2', 'lista-B3', 'lista-B4', 'lista-oficiales'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = "";
        });

        tests.forEach(t => {
            const label = document.createElement('label');
            label.className = 'test-item';
            label.innerHTML = `<input type="radio" name="test-select" value="${t.id}"> <span>${t.nombreVisible}</span>`;
            
            const idSuperior = t.id.toUpperCase();
            if (idSuperior.startsWith("EX") || idSuperior.startsWith("SI")) {
                document.getElementById('lista-oficiales').appendChild(label);
            } else {
                const contenedor = document.getElementById(`lista-B${t.bloque}`);
                if (contenedor) contenedor.appendChild(label);
            }
        });

        document.querySelectorAll('details.bloque').forEach(d => {
            d.querySelector('summary').onclick = () => {
                document.querySelectorAll('details.bloque').forEach(other => {
                    if (other !== d) other.removeAttribute('open');
                });
            };
        });
    } catch (e) {
        console.error("Error menú:", e);
    }
}

// 3. COMENZAR TEST
document.getElementById('btnComenzar').onclick = async () => {
    const seleccionado = document.querySelector('input[name="test-select"]:checked');
    if (!seleccionado) return alert("Selecciona un test 🚀");

    const btn = document.getElementById('btnComenzar');
    btn.textContent = "CARGANDO...";
    
    try {
        const res = await fetch(`${URL_SCRIPT}?idTest=${seleccionado.value}&t=${new Date().getTime()}`);
        preguntasTest = await res.json();
        
        modoEstudio = document.querySelector('input[name="modo"]:checked').value === 'estudio';
        
        document.getElementById('pantalla-inicio').classList.add('hidden');
        if(document.querySelector('.footer-controls')) document.querySelector('.footer-controls').classList.add('hidden');
        document.getElementById('pantalla-test').classList.remove('hidden');

        preguntaActualIndex = 0;
        puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
        mostrarPregunta();
    } catch (e) {
        alert("Error de conexión. Revisa la implementación en Google.");
    } finally {
        btn.textContent = "COMENZAR TEST";
    }
};

// 4. LÓGICA DE PREGUNTAS
function mostrarPregunta() {
    const p = preguntasTest[preguntaActualIndex];
    esDudada = false;
    document.getElementById('btnArriesgando').classList.remove('active');
    document.getElementById('feedback-area').classList.add('hidden');
    
    document.getElementById('contador-preguntas').textContent = `Pregunta ${preguntaActualIndex + 1}/${preguntasTest.length}`;
    document.getElementById('enunciado').textContent = p.enunciado;
    
    const lista = document.getElementById('opciones-lista');
    lista.innerHTML = "";
    const btnAccion = document.getElementById('btnAccion');
    btnAccion.disabled = true;
    btnAccion.textContent = modoEstudio ? "CORREGIR" : "SIGUIENTE";

    ["a", "b", "c", "d"].forEach(letra => {
        const btn = document.createElement('button');
        btn.className = "opcion";
        btn.textContent = `${letra}) ${p.opciones[letra]}`; 
        btn.dataset.letra = letra; 

        btn.onclick = () => {
            document.querySelectorAll('.opcion').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            btnAccion.disabled = false;
            btnAccion.onclick = () => procesarRespuesta(letra);
        };
        lista.appendChild(btn);
    });
}

document.getElementById('btnArriesgando').onclick = function() {
    esDudada = !esDudada;
    this.classList.toggle('active', esDudada);
};

function procesarRespuesta(seleccionada) {
    const p = preguntasTest[preguntaActualIndex];
    const correcta = p.correcta.toString().toLowerCase().trim();
    
    p.tuRespuesta = seleccionada;
    p.tuRespuestaText = `${seleccionada}) ${p.opciones[seleccionada]}`; 
    p.fueDudada = esDudada; 

    if (esDudada) puntuacion.arriesgadas++;
    if (seleccionada === correcta) puntuacion.aciertos++;
    else puntuacion.fallos++;

    if (modoEstudio) {
        document.querySelectorAll('.opcion').forEach(btn => {
            const letra = btn.dataset.letra; 
            if (letra === correcta) btn.style.background = "#28a745"; 
            if (letra === seleccionada && seleccionada !== correcta) btn.style.background = "#dc3545";
            btn.disabled = true; 
        });
        document.getElementById('feedback-texto').textContent = p.feedback;
        document.getElementById('feedback-area').classList.remove('hidden');
        const btnAccion = document.getElementById('btnAccion');
        btnAccion.textContent = "SIGUIENTE";
        btnAccion.onclick = () => siguiente();
    } else {
        siguiente();
    }
}

function siguiente() {
    preguntaActualIndex++;
    if (preguntaActualIndex < preguntasTest.length) mostrarPregunta();
    else mostrarResumen();
}

// 5. RESUMEN Y FINALIZAR
function mostrarResumen() {
    document.getElementById('pantalla-test').classList.add('hidden');
    document.getElementById('pantalla-resultados').classList.remove('hidden');

    const total = preguntasTest.length;
    const porcentaje = total > 0 ? ((puntuacion.aciertos / total) * 100).toFixed(2) : 0;
    
    document.getElementById('contenedor-stats').innerHTML = `
        <div class="resumen-stats">
            <div class="stat-card card-aciertos">ACIERTOS: ${puntuacion.aciertos}</div>
            <div class="stat-card card-fallos">FALLOS: ${puntuacion.fallos}</div>
            <div class="stat-card card-dudas">DUDAS: ${puntuacion.arriesgadas}</div>
        </div>
        <div class="caja-brillo-celeste" style="margin-top:20px;">
            <span class="porcentaje-celeste">${porcentaje}%</span>
        </div>
    `;

    const informe = document.getElementById('contenedor-informe');
    informe.innerHTML = '<h3 style="color:#00d4ff; text-align:center;">REVISIÓN</h3>';
    
    preguntasTest.forEach((p, index) => {
        if (p.tuRespuesta === p.correcta && !p.fueDudada) return;
        const div = document.createElement('div');
        div.className = "item-revision";
        div.innerHTML = `<p><strong>${index + 1}. ${p.enunciado}</strong></p>
                         <p>Tuya: ${p.tuRespuestaText} | Correcta: ${p.correcta}</p>
                         <p><em>${p.feedback}</em></p>`;
        informe.appendChild(div);
    });

    document.getElementById('contenedor-boton-volver').innerHTML = `<button class="btn-volver" onclick="location.reload()">INICIO</button>`;
    finalizar();
}

function finalizar() {
    const seleccionado = document.querySelector('input[name="test-select"]:checked');
    const idTest = seleccionado ? seleccionado.value : "TEST"; 
    const nota = ((puntuacion.aciertos / preguntasTest.length) * 100).toFixed(2);

    const url = `${URL_SCRIPT}?accion=guardar&test=${encodeURIComponent(idTest)}&aciertos=${puntuacion.aciertos}&fallos=${puntuacion.fallos}&dudas=${puntuacion.arriesgadas}&nota=${nota}`;
    fetch(url, { mode: 'no-cors' });
}

async function mostrarEstadisticas() {
    document.getElementById('pantalla-inicio').classList.add('hidden');
    const pantallaEst = document.getElementById('pantalla-estadisticas');
    pantallaEst.classList.remove('hidden');
    pantallaEst.innerHTML = '<h2>CARGANDO...</h2>';

    try {
        const resp = await fetch(`${URL_SCRIPT}?accion=obtenerEstadisticas`);
        const temas = await resp.json();
        let html = '<h2>NOTAS POR TEMA</h2>';
        for (let t in temas) {
            const p = ((temas[t].aciertos / (temas[t].aciertos + temas[t].fallos)) * 100).toFixed(1);
            html += `<p>${t}: ${p}%</p>`;
        }
        html += '<button class="btn-volver" onclick="location.reload()">VOLVER</button>';
        pantallaEst.innerHTML = html;
    } catch (e) { location.reload(); }
}

document.getElementById('btnEstadisticas').onclick = mostrarEstadisticas;
window.onload = cargarMenuDinamico;
