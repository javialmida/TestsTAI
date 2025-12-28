const URL_SCRIPT = "https://script.google.com/macros/s/AKfycbwfB5sZE-q22Ha5uvvYM89wFyu74RfVyWM9k2ZA0sg7v9wGtNkCPVr1qM-iPY4UfmNd/exec";

let preguntasTest = [];
let preguntaActualIndex = 0;
let puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
let modoEstudio = true;
let esDudada = false;

async function cargarMenuDinamico() {
    try {
        const res = await fetch(`${URL_SCRIPT}?accion=obtenerListaTests`);
        const texto = await res.text();
        const data = JSON.parse(texto);
        
        ['lista-B1', 'lista-B2', 'lista-B3', 'lista-B4', 'lista-oficiales'].forEach(id => {
            const el = document.getElementById(id); if (el) el.innerHTML = "";
        });

        data.forEach(t => {
            const label = document.createElement('label');
            label.className = 'test-item';
            label.innerHTML = `<input type="radio" name="test-select" value="${t.id}"> <span>${t.nombreVisible}</span>`;
            const idS = t.id.toUpperCase();
            const cont = (idS.startsWith("EX") || idS.startsWith("SI")) ? document.getElementById('lista-oficiales') : document.getElementById(`lista-B${t.bloque}`);
            if (cont) cont.appendChild(label);
        });
    } catch (e) { console.error("Error cargando menú"); }
}

document.getElementById('btnComenzar').onclick = async () => {
    const sel = document.querySelector('input[name="test-select"]:checked');
    if (!sel) return alert("Selecciona un test 🚀");
    const btn = document.getElementById('btnComenzar');
    btn.textContent = "CARGANDO...";
    
    try {
        const res = await fetch(`${URL_SCRIPT}?idTest=${sel.value}&t=${Date.now()}`);
        const textoJSON = await res.text();
        preguntasTest = JSON.parse(textoJSON);
        
        modoEstudio = document.querySelector('input[name="modo"]:checked').value === 'estudio';
        document.getElementById('pantalla-inicio').classList.add('hidden');
        if(document.querySelector('.footer-controls')) document.querySelector('.footer-controls').classList.add('hidden');
        document.getElementById('pantalla-test').classList.remove('hidden');

        preguntaActualIndex = 0;
        puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
        mostrarPregunta();
    } catch (e) { alert("Error de conexión. Reintenta."); }
    finally { btn.textContent = "COMENZAR TEST"; }
};

function mostrarPregunta() {
    const p = preguntasTest[preguntaActualIndex];
    esDudada = false;
    document.getElementById('btnArriesgando').classList.remove('active');
    document.getElementById('feedback-area').classList.add('hidden');
    document.getElementById('contador-preguntas').textContent = `Pregunta ${preguntaActualIndex + 1}/${preguntasTest.length}`;
    document.getElementById('enunciado').textContent = p.enunciado;
    const lista = document.getElementById('opciones-lista');
    lista.innerHTML = "";
    const btnA = document.getElementById('btnAccion');
    btnA.disabled = true;
    btnA.textContent = modoEstudio ? "CORREGIR" : "SIGUIENTE";

    ["a", "b", "c", "d"].forEach(letra => {
        const btn = document.createElement('button');
        btn.className = "opcion";
        btn.textContent = `${letra}) ${p.opciones[letra]}`; 
        btn.dataset.letra = letra; 
        btn.onclick = () => {
            document.querySelectorAll('.opcion').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            btnA.disabled = false;
            btnA.onclick = () => procesarRespuesta(letra);
        };
        lista.appendChild(btn);
    });
}

document.getElementById('btnArriesgando').onclick = function() {
    esDudada = !esDudada;
    this.classList.toggle('active', esDudada);
};

function procesarRespuesta(sel) {
    const p = preguntasTest[preguntaActualIndex];
    const corr = p.correcta.toLowerCase().trim();
    if (esDudada) puntuacion.arriesgadas++;
    if (sel === corr) puntuacion.aciertos++; else puntuacion.fallos++;

    if (modoEstudio) {
        document.querySelectorAll('.opcion').forEach(b => {
            const l = b.dataset.letra;
            if (l === corr) b.style.background = "#28a745";
            if (l === sel && sel !== corr) b.style.background = "#dc3545";
            b.disabled = true;
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
    else { alert("Test terminado"); location.reload(); }
}

window.onload = cargarMenuDinamico;
