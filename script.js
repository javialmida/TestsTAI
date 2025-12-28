const URL_SCRIPT = "https://script.google.com/macros/s/AKfycbwfB5sZE-q22Ha5uvvYM89wFyu74RfVyWM9k2ZA0sg7v9wGtNkCPVr1qM-iPY4UfmNd/exec";

let preguntasTest = [];
let preguntaActualIndex = 0;
let puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
let modoEstudio = true;

async function cargarMenuDinamico() {
    try {
        const res = await fetch(`${URL_SCRIPT}?accion=obtenerListaTests`);
        const texto = await res.text(); // Recibimos como texto
        const tests = JSON.parse(texto); // Convertimos a objeto
        
        ['lista-B1', 'lista-B2', 'lista-B3', 'lista-B4', 'lista-oficiales'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = "";
        });

        tests.forEach(t => {
            const label = document.createElement('label');
            label.className = 'test-item';
            label.innerHTML = `<input type="radio" name="test-select" value="${t.id}"> <span>${t.nombreVisible}</span>`;
            const idSup = t.id.toUpperCase();
            const cont = (idSup.startsWith("EX") || idSup.startsWith("SI")) ? document.getElementById('lista-oficiales') : document.getElementById(`lista-B${t.bloque}`);
            if (cont) cont.appendChild(label);
        });
        
        document.querySelectorAll('details.bloque').forEach(d => {
            d.querySelector('summary').onclick = () => {
                document.querySelectorAll('details.bloque').forEach(other => { if (other !== d) other.removeAttribute('open'); });
            };
        });
    } catch (e) { console.log("Cargando..."); }
}

document.getElementById('btnComenzar').onclick = async () => {
    const sel = document.querySelector('input[name="test-select"]:checked');
    if (!sel) return alert("Selecciona un test 🚀");
    const btn = document.getElementById('btnComenzar');
    btn.textContent = "CARGANDO...";
    try {
        const res = await fetch(`${URL_SCRIPT}?idTest=${sel.value}`);
        const texto = await res.text();
        preguntasTest = JSON.parse(texto);
        
        modoEstudio = document.querySelector('input[name="modo"]:checked').value === 'estudio';
        document.getElementById('pantalla-inicio').classList.add('hidden');
        if(document.querySelector('.footer-controls')) document.querySelector('.footer-controls').classList.add('hidden');
        document.getElementById('pantalla-test').classList.remove('hidden');
        preguntaActualIndex = 0;
        puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
        mostrarPregunta();
    } catch (e) { alert("Error de datos. Prueba a darle otra vez."); }
    finally { btn.textContent = "COMENZAR TEST"; }
};

function mostrarPregunta() {
    const p = preguntasTest[preguntaActualIndex];
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

let esDudada = false;
document.getElementById('btnArriesgando').onclick = function() {
    esDudada = !esDudada;
    this.classList.toggle('active', esDudada);
};

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
    } else { siguiente(); }
}

function siguiente() {
    preguntaActualIndex++;
    if (preguntaActualIndex < preguntasTest.length) mostrarPregunta();
    else mostrarResumen();
}

function mostrarResumen() {
    document.getElementById('pantalla-test').classList.add('hidden');
    document.getElementById('pantalla-resultados').classList.remove('hidden');
    const total = preguntasTest.length;
    const nota = total > 0 ? ((puntuacion.aciertos / total) * 100).toFixed(2) : 0;
    document.getElementById('contenedor-stats').innerHTML = `
        <div class="resumen-stats">
            <div class="stat-card card-aciertos">ACIERTOS: ${puntuacion.aciertos}</div>
            <div class="stat-card card-fallos">FALLOS: ${puntuacion.fallos}</div>
            <div class="stat-card card-dudas">DUDAS: ${puntuacion.arriesgadas}</div>
        </div>
        <div class="caja-brillo-celeste" style="margin-top:20px;"><span class="porcentaje-celeste">${nota}%</span></div>
    `;
    document.getElementById('contenedor-boton-volver').innerHTML = `<button class="btn-main" onclick="location.reload()">INICIO</button>`;
    const sel = document.querySelector('input[name="test-select"]:checked');
    const url = `${URL_SCRIPT}?accion=guardar&test=${encodeURIComponent(sel.value)}&aciertos=${puntuacion.aciertos}&fallos=${puntuacion.fallos}&dudas=${puntuacion.arriesgadas}&nota=${nota}`;
    fetch(url, { mode: 'no-cors' });
}

window.onload = cargarMenuDinamico;
