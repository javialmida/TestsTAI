// --- CONFIGURACIÓN SUPABASE ---
const SB_URL = "https://ogpprghtohbumqihzxwt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncHByZ2h0b2hidW1xaWh6eHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMTA5MDMsImV4cCI6MjA4MjU4NjkwM30.TDkm0NHDNh0gec26s6gnvHH_euJPuGLqX5nghMXy2wI";
const sb = supabase.createClient(SB_URL, SB_KEY);

// --- ESTADO GLOBAL ---
let state = { 
    q: [], 
    cur: 0, 
    ans: [], 
    mode: localStorage.getItem('user-test-mode') || 'estudio',
    status: 'waiting', 
    arriesgando: false,
    currentTestId: null, 
    currentTestName: "",
    currentIntentoId: null,
    bloquesCache: null,
    testsCache: null,
    timerInterval: null,
    seconds: 0
};

// --- OBJETO APP PRINCIPAL ---
const app = {

    fixHTML: (text) => {
    if (!text) return "";

    // 1. Extraemos los bloques de código <pre> para protegerlos y ponemos un marcador temporal.
    // Usamos un array para guardar el contenido original de cada bloque.
    const codeBlocks = [];
    let protectedText = text.replace(/<pre>([\s\S]*?)<\/pre>/g, (match, contenido) => {
        codeBlocks.push(contenido);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    // 2. Escapamos TODO el texto restante.
    // Esto convierte "Si x < 5" en "Si x &lt; 5", que es seguro para innerHTML.
    let safeText = protectedText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // 3. Restauramos los bloques de código en sus marcadores.
    // IMPORTANTE: También escapamos el contenido DENTRO del pre para que el código se vea bien.
    return safeText.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
        let codeContent = codeBlocks[index];
        
        // Escapamos los caracteres dentro del código (ej: for(i < 10))
        let safeCode = codeContent
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

        return `<pre>${safeCode}</pre>`;
    });
    },

    // --- FUNCIONES DEL CRONÓMETRO ---
    startTimer: () => {
        app.stopTimer();
        state.seconds = 0;
        document.getElementById('timer').innerText = "00:00";
        document.getElementById('timer').classList.remove('hidden');
        
        state.timerInterval = setInterval(() => {
            state.seconds++;
            document.getElementById('timer').innerText = app.formatTime(state.seconds);
        }, 1000);
    },

    stopTimer: () => {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
    },

    formatTime: (totalSeconds) => {
        const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    },

    // --- NUEVO: CLOUD SAVE (PERSISTENCIA EN SUPABASE) ---
    guardarProgreso: async () => {
        // Solo guardamos si estamos en medio de un test activo
        if (state.status === 'waiting' || state.status === 'done') {
            const copiaSeguridad = {
                q: state.q,
                cur: state.cur,
                ans: state.ans,
                mode: state.mode,
                seconds: state.seconds,
                currentTestId: state.currentTestId,
                currentTestName: state.currentTestName,
                currentIntentoId: state.currentIntentoId,
                timestamp: new Date().getTime()
            };

            // Upsert: Si existe el ID 1 lo actualiza, si no, lo crea.
            // Usamos ID 1 fijo para simular una "Memory Card" única global.
            const { error } = await sb.from('sesiones_activas').upsert({ 
                id: 1, 
                estado_json: copiaSeguridad 
            });

            if (error) console.error("Error al guardar en nube:", error);
        }
    },

    borrarProgreso: async () => {
        // Borramos la ranura 1 de la base de datos
        await sb.from('sesiones_activas').delete().eq('id', 1);
        
        // Ocultamos el botón de continuar si existía
        const btnResume = document.getElementById('btn-resume-session');
        if (btnResume) btnResume.classList.add('hidden');
    },

    restaurarSesion: async () => {
        const { data, error } = await sb.from('sesiones_activas').select('estado_json').eq('id', 1).single();
        
        if (error || !data) return alert("No se pudo recuperar la sesión de la nube.");

        try {
            const datos = data.estado_json;
            
            // 1. Restauramos el estado global
            app.resetState(); 
            state.q = datos.q;
            state.cur = datos.cur;
            state.ans = datos.ans;
            state.mode = datos.mode;
            state.seconds = datos.seconds; 
            state.currentTestId = datos.currentTestId;
            state.currentTestName = datos.currentTestName;
            state.currentIntentoId = datos.currentIntentoId;

            // 2. Cambiamos a la vista
            app.switchView('view-test');
            document.getElementById('btn-salir').classList.remove('hidden');
            
            // 3. Arrancamos timer y renderizamos
            app.startTimer();
            // Ajustamos el timer visualmente al instante
            document.getElementById('timer').innerText = app.formatTime(state.seconds);
            
            app.render();
            
            alert(`☁️ Sesión en la nube recuperada:\n${state.currentTestName}\nPregunta ${state.cur + 1}`);

        } catch (e) {
            console.error(e);
            alert("Datos de sesión corruptos.");
            app.borrarProgreso();
        }
    },

    init: async () => {
        // Recuperar modo visual guardado
        const modoGuardado = localStorage.getItem('user-test-mode');
        if (modoGuardado) {
            const inputModo = document.querySelector(`input[name="modo"][value="${modoGuardado}"]`);
            if (inputModo) inputModo.checked = true;
        }

        try {
            // Listener cambio de modo
            document.querySelectorAll('input[name="modo"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    state.mode = e.target.value;
                    localStorage.setItem('user-test-mode', e.target.value);
                });
            });

            // Carga inicial de datos
            const [testsRes, bloquesRes, intentosRes] = await Promise.all([
                sb.from('tests').select(`id, nombre, tipo, identificador, visible, info, temas (nombre, bloque_id)`).eq('visible', true),
                sb.from('bloques').select('id, nombre'),
                sb.from('intentos').select('test_id, completado')
            ]);
            
            if (testsRes.error) throw testsRes.error;
            const tests = testsRes.data;
            const nombresBloques = bloquesRes.data || [];

            state.testsCache = tests;
            state.bloquesCache = nombresBloques;
            
            // Tests completados
            const testsHechos = new Set((intentosRes.data || []).filter(i => i.completado).map(i => i.test_id));

            // 1. OFICIALES
            const oficiales = tests.filter(t => t.tipo === 'examen_simulacro');
            oficiales.sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true }));

            document.getElementById('list-oficiales').innerHTML = oficiales.map(t => 
                renderTestButton(t, testsHechos.has(t.id))
            ).join('');

            // 2. AGRUPAR POR BLOQUE
            const temasTests = tests.filter(t => t.tipo === 'test_por_tema');
            const bloques = {};
            temasTests.forEach(t => {
                const bId = t.temas?.bloque_id || "Sin Bloque";
                if (!bloques[bId]) bloques[bId] = [];
                bloques[bId].push(t);
            });

            // 3. RENDERIZAR ACORDEÓN
            const listTemas = document.getElementById('list-temas');
            listTemas.innerHTML = ""; 

            Object.keys(bloques).sort().forEach(bId => {
                const bloqueEncontrado = nombresBloques.find(b => b.id == bId);
                const nombreMostrar = bloqueEncontrado ? bloqueEncontrado.nombre : `BLOQUE ${bId}`;

                bloques[bId].sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true }));

                const detalles = document.createElement('details');
                detalles.className = 'bloque-container';
                detalles.innerHTML = `
                    <summary class="bloque-header">
                        <span>📦 ${nombreMostrar}</span>
                        <small>${bloques[bId].length} tests</small>
                    </summary>
                    <div class="bloque-content">
                        ${bloques[bId].map(t => renderTestButton(t, testsHechos.has(t.id))).join('')}
                    </div>
                `;
                listTemas.appendChild(detalles);
            });

            // ... (código anterior del init: tests, bloques, acordeón...)

            // --- NUEVO: Detectar si hay sesión pendiente EN LA NUBE ---
            console.log("☁️ Buscando sesión en la nube...");
            
            const { data: sesionNube, error: errNube } = await sb
                .from('sesiones_activas')
                .select('estado_json')
                .eq('id', 1)
                .maybeSingle();
            
            if (sesionNube && sesionNube.estado_json) {
                const datos = sesionNube.estado_json;
                
                // Usamos el Dashboard (view-stats) directamente como te gustaba
                const dashboard = document.getElementById('view-stats');
                
                // Si el dashboard existe y no hemos pintado ya el botón...
                if (dashboard && !document.getElementById('btn-resume-session')) {
                    
                    const divAviso = document.createElement('div');
                    divAviso.id = 'btn-resume-session';
                    // APLICAMOS LA CLASE CSS QUE ACABAMOS DE CREAR
                    divAviso.className = 'resume-card'; 
                    
                    divAviso.innerHTML = `
                        <h3 style="color: #ff9800; margin: 0 0 10px 0; font-size: 1.1em; text-transform: uppercase; letter-spacing: 1px;">
                            ⚠️ Tienes un test a medias
                        </h3>
                        <p style="margin: 0 0 15px 0; font-size: 0.95em; opacity: 0.9;">
                            <strong>${datos.currentTestName}</strong> <br>
                            <span style="font-size: 0.85em; opacity: 0.7">(Pregunta ${datos.cur + 1} de ${datos.q.length})</span>
                        </p>
                        <div style="display: flex; gap: 10px; justify-content: center;">
                            <button onclick="app.restaurarSesion()" style="background: #ff9800; color: #000; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 0.9em; transition: transform 0.2s;">
                                ▶ REANUDAR
                            </button>
                            <button onclick="app.borrarProgreso()" style="background: transparent; border: 1px solid rgba(255,255,255,0.3); color: white; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 0.9em;">
                                🗑️ DESCARTAR
                            </button>
                        </div>
                    `;
                    // Lo insertamos al principio del todo del dashboard
                    dashboard.insertBefore(divAviso, dashboard.firstChild);
                }
            } 

        } catch (err) { console.error("Error init:", err.message); }
        
        // Listeners globales...
        document.addEventListener('click', (e) => {
             const clickedDetails = e.target.closest('.bloque-container');
             if (clickedDetails && !e.target.closest('.bloque-content')) {
                 const todosLosBloques = document.querySelectorAll('.bloque-container');
                 todosLosBloques.forEach((bloque) => {
                     if (bloque !== clickedDetails) {
                         bloque.removeAttribute('open');
                     }
                 });
             }
        });
    }, // Fin Init

    prepararRepaso: async (tipo) => {
        try {
            app.resetState();
            let ids = []; 

            // Carga de seguridad si caché vacía
            if (!state.testsCache) {
                const { data: testsCargados, error: errCache } = await sb.from('tests').select('*');
                if (errCache) throw errCache;
                state.testsCache = testsCargados;
            }

            if (tipo === 'simulacro') {
                const { data: intentos } = await sb.from('intentos')
                    .select('test_id')
                    .eq('completado', true);
            
                if (!intentos || intentos.length === 0) return alert("¡Aún no has completado ningún test para generar un simulacro!");

                const testIdsCompletados = [...new Set(intentos.map(i => i.test_id))];
                const testsValidos = state.testsCache.filter(t => 
                    testIdsCompletados.includes(t.id) && t.tipo === 'test_por_tema'
                ).map(t => t.id);

                if (testsValidos.length === 0) return alert("Has completado tests, pero ninguno es 'Por Tema'.");

                const slider = document.getElementById('simulacro-range');
                const limitePreguntas = slider ? parseInt(slider.value, 10) : 100;
                const modoRadio = document.querySelector('input[name="simulacro-modo"]:checked');
                const modo = modoRadio ? modoRadio.value : 'todo'; 

                let rawData = [];

                if (modo === 'fallos') {
                    const { data: errores, error } = await sb.from('errores')
                        .select('pregunta_id, test_id')
                        .in('test_id', testsValidos);
                    
                    if (error) throw error;
                    if (!errores || errores.length === 0) return alert("✅ ¡Genial! No tienes fallos registrados en tus tests completados.");
                    
                    rawData = errores.map(e => ({ id: e.pregunta_id, test_id: e.test_id }));

                } else {
                    const { data, error } = await sb.from('preguntas')
                        .select('id, test_id')
                        .in('test_id', testsValidos);

                    if (error) throw error;
                    rawData = data;
                }

                if (!rawData || rawData.length === 0) return alert("Error: No se encontraron preguntas disponibles.");

                // Algoritmo Round Robin
                const bolsasPorTema = {};
                rawData.forEach(p => {
                    if (!bolsasPorTema[p.test_id]) bolsasPorTema[p.test_id] = [];
                    bolsasPorTema[p.test_id].push(p.id);
                });

                Object.values(bolsasPorTema).forEach(lista => lista.sort(() => Math.random() - 0.5));

                ids = [];
                const keys = Object.keys(bolsasPorTema);
                let buscando = true;

                while (ids.length < limitePreguntas && buscando) {
                    buscando = false; 
                    for (const key of keys) {
                        if (ids.length >= limitePreguntas) break; 
                        
                        if (bolsasPorTema[key].length > 0) {
                            ids.push(bolsasPorTema[key].pop()); 
                            buscando = true; 
                        }
                    }
                }
                
                const icono = modo === 'fallos' ? '⚠️' : '🤖';
                state.currentTestName = `${icono} SIMULACRO (${ids.length} PREGUNTAS)`;
            }
            else { 
                // REPASO DE ERRORES (Crítico, Express, Semanal)
                let query = sb.from('errores').select('pregunta_id, veces_fallada, ultimo_fallo');
                
                if (tipo === 'critico') {
                    query = query.order('veces_fallada', { ascending: false }).limit(30);
                    state.currentTestName = "🔥 MODO CRÍTICO";
                } else if (tipo === 'express') {
                    query = query.order('ultimo_fallo', { ascending: false }).limit(100); 
                    state.currentTestName = "⚡ REPASO EXPRESS";
                } else if (tipo === 'semanal') {
                    const unaSemanaAtras = new Date();
                    unaSemanaAtras.setDate(unaSemanaAtras.getDate() - 7);
                    query = query.gte('ultimo_fallo', unaSemanaAtras.toISOString())
                                     .order('ultimo_fallo', { ascending: false }).limit(50);
                    state.currentTestName = "📅 REPASO SEMANAL";
                }

                const { data: listaErrores, error: errErr } = await query;
                if (errErr) throw errErr;
                if (!listaErrores || listaErrores.length === 0) return alert("¡Sin fallos registrados para este modo!");
                
                ids = listaErrores.map(e => e.pregunta_id);
                if (tipo === 'express') ids = ids.sort(() => Math.random() - 0.5).slice(0, 20);
            }

            const { data: preguntas, error: errP } = await sb.from('preguntas').select('*').in('id', ids);
            if (errP) throw errP;

            state.q = preguntas.sort(() => Math.random() - 0.5);
            state.mode = document.querySelector('input[name="modo"]:checked').value;
            state.currentIntentoId = null; 

            app.switchView('view-test');
            document.getElementById('btn-salir').classList.remove('hidden');
            app.startTimer(); 
            app.render();

        } catch (error) { 
            console.error(error); 
            alert("Ocurrió un error al generar el repaso. Revisa la consola.");
        }
    },

    resetState: () => {
        app.stopTimer();
        
        // Guardamos las cachés antes de resetear
        const backupTests = state.testsCache;
        const backupBloques = state.bloquesCache;

        // Reseteamos el estado
        state = { 
            q: [], 
            cur: 0, 
            ans: [], 
            mode: 'estudio', 
            status: 'waiting', 
            arriesgando: false, 
            currentTestId: null, 
            currentTestName: "", 
            currentIntentoId: null,
            
            // Restauramos las cachés
            testsCache: backupTests,
            bloquesCache: backupBloques
        };

        document.getElementById('q-feedback')?.classList.add('hidden');
        document.getElementById('counter')?.classList.add('hidden');
        document.getElementById('btn-arriesgando')?.classList.remove('active');
        document.getElementById('btn-salir')?.classList.add('hidden');
    },

    registrarError: async (preguntaId, testId) => {
        try {
            const { data: ex, error } = await sb.from('errores').select('id, veces_fallada').eq('pregunta_id', preguntaId).maybeSingle();
            
            if (error) throw error;

            if (ex) {
                await sb.from('errores').update({ 
                    veces_fallada: ex.veces_fallada + 1, 
                    ultimo_fallo: new Date().toISOString() 
                }).eq('id', ex.id);
            } else {
                await sb.from('errores').insert([{ 
                    pregunta_id: preguntaId, 
                    test_id: testId,
                    veces_fallada: 1,
                    ultimo_fallo: new Date().toISOString()
                }]);
            }
        } catch (err) { console.error("Error registrando fallo:", err); }
    },

    start: async (testId) => {
        try {
            app.resetState();
            const { data: testInfo } = await sb.from('tests').select('nombre, identificador').eq('id', testId).single();
            const { data: preguntas, error } = await sb.from('preguntas').select('*').eq('test_id', testId).order('id', { ascending: true });
            if (error) throw error;
            state.q = preguntas;
            state.currentTestId = testId;
            state.currentTestName = testInfo ? `${testInfo.identificador || ''} ${testInfo.nombre}` : "Test";
            state.mode = document.querySelector('input[name="modo"]:checked').value; 
            
            const { data: intento, error: errorIntento } = await sb.from('intentos').insert([{ 
                test_id: testId, 
                aciertos: 0, 
                fallos: 0, 
                arriesgadas: 0
            }]).select().single();
            
            if (errorIntento) throw errorIntento;
            state.currentIntentoId = intento.id;

            app.switchView('view-test');
            document.getElementById('btn-salir').classList.remove('hidden');
            app.startTimer();
            app.render();
        } catch (err) { alert(err.message); }
    },

    actualizarIntento: async () => {
        if (!state.currentIntentoId) return;
        const aciertos = state.ans.filter((a, i) => a && a.letra === state.q[i].correcta.toLowerCase()).length;
        const arriesgadas = state.ans.filter(a => a && a.arriesgada).length;
        const fallos = state.ans.filter((a, i) => a && a.letra !== state.q[i].correcta.toLowerCase()).length;
        
        await sb.from('intentos').update({ 
            aciertos, fallos, arriesgadas 
        }).eq('id', state.currentIntentoId);
    }, 

    render: () => {
        const item = state.q[state.cur];
        state.status = 'waiting';
        state.arriesgando = false;
        document.getElementById('btn-arriesgando').classList.remove('active');
        document.getElementById('counter').innerText = `Pregunta ${state.cur + 1}/${state.q.length}`;
        document.getElementById('counter').classList.remove('hidden');
        
        // --- CÓDIGO NUEVO ---
        let headerHtml = `<div class="test-header-info">${state.currentTestName}</div>`;

        // 2. Buscamos el origen y el número de orden REAL (campo numero_orden)
        if (state.testsCache) {
            const testOrigen = state.testsCache.find(t => t.id === item.test_id);
            if (testOrigen) {
                const nombreReal = `${testOrigen.identificador || ''} ${testOrigen.nombre}`.trim();
                
                // CORRECCIÓN: Usamos exactamente el campo 'numero_orden' de tu tabla
                const numOrdenOriginal = item.numero_orden || '?';

                // Si el nombre del test es distinto al modo (ej. estamos en Repaso), mostramos ambas líneas
                if (!state.currentTestName.includes(nombreReal)) {
                    headerHtml += `<div class="test-header-info">${nombreReal} — Pregunta nº ${numOrdenOriginal}</div>`;
                } else {
                    // Si estamos en el test normal, fusionamos la info en una línea
                    headerHtml = `<div class="test-header-info">${state.currentTestName} — Pregunta nº ${numOrdenOriginal}</div>`;
                }
            }
        }

        // 3. Inyectamos en el HTML
        //document.getElementById('q-enunciado').innerHTML = `${headerHtml}${state.cur + 1}. ${item.enunciado}`;
        // ENVUELVE item.enunciado CON app.fixHTML(...)
        document.getElementById('q-enunciado').innerHTML = `${headerHtml}${state.cur + 1}. ${app.fixHTML(item.enunciado)}`;
        
        const imgEl = document.getElementById('question-img');
        if (item.imagen_url) {
            imgEl.src = item.imagen_url;
            imgEl.classList.remove('hidden');
        } else {
            imgEl.classList.add('hidden');
            imgEl.src = ''; 
        }
        
        document.getElementById('q-feedback').classList.add('hidden');
        const btnAccion = document.getElementById('btn-accion');
        btnAccion.innerText = (state.mode === 'examen') ? "SIGUIENTE" : "CORREGIR";
        btnAccion.disabled = true;
        const container = document.getElementById('q-options');
        container.innerHTML = "";
        ['a','b','c','d'].forEach(l => {
            if(item['opcion_'+l]){
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                //btn.innerHTML = `${l.toUpperCase()}) ${item['opcion_'+l]}`;
                // ENVUELVE item['opcion_'+l] CON app.fixHTML(...)
                btn.innerHTML = `${l.toUpperCase()}) ${app.fixHTML(item['opcion_'+l])}`;
                btn.onclick = () => app.handleSelect(l, btn);
                container.appendChild(btn);
            }
        });
    },

    handleSelect: (letra, btn) => {
        if (state.status !== 'waiting') return;
        document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.ans[state.cur] = { letra, arriesgada: state.arriesgando };
        document.getElementById('btn-accion').disabled = false;
        
        // --- NUEVO: Autoguardado ASINCRONO en cada click (Cloud Save) ---
        //app.guardarProgreso();
    },

    manejarAccion: () => {
        if (state.mode === 'examen') app.siguiente();
        else {
            const btn = document.getElementById('btn-accion');
            if (btn.innerText === "CORREGIR") app.corregir();
            else app.siguiente();
        }
    },

    corregir: async () => {
        const item = state.q[state.cur];
        const userSel = state.ans[state.cur]?.letra;
        const correcta = item.correcta.toLowerCase();
        document.querySelectorAll('.option-btn').forEach(b => {
            const l = b.innerText[0].toLowerCase();
            if (l === correcta) b.classList.add('correct');
            if (l === userSel && userSel !== correcta) b.classList.add('incorrect');
        });
        if (userSel !== correcta) await app.registrarError(item.id, item.test_id);
        if (item.feedback) { 
            const fbDiv = document.getElementById('q-feedback');
            fbDiv.innerText = "💡 " + item.feedback;
            fbDiv.classList.remove('hidden');
        }
        state.status = 'done';
        document.getElementById('btn-accion').innerText = "SIGUIENTE";
        // ✅ AÑADE ESTO AQUÍ:
        app.guardarProgreso();
        await app.actualizarIntento();
    },

    siguiente: () => {
        if (state.mode === 'examen') {
            const item = state.q[state.cur];
            const res = state.ans[state.cur];
            const correcta = item.correcta.toLowerCase();
            
            if (!res || res.letra !== correcta) {
                app.registrarError(item.id, item.test_id);
            }
            app.actualizarIntento();
        }

        if (state.cur < state.q.length - 1) { 
            state.cur++; 
            // --- NUEVO: Guardamos INMEDIATAMENTE al pasar de hoja ---
            app.guardarProgreso(); 
            // --------------------------------------------------------
            app.render(); 
        } else {
            app.finalizar();
        }
    },

    toggleArriesgando: () => {
        state.arriesgando = !state.arriesgando;
        document.getElementById('btn-arriesgando').classList.toggle('active');
        if (state.ans[state.cur]) state.ans[state.cur].arriesgada = state.arriesgando;
    },

    finalizar: async () => {
        app.stopTimer(); 
        
        // --- NUEVO: Borramos de la nube (usando await para asegurar) ---
        await app.borrarProgreso(); 
        
        app.switchView('view-results');
        document.getElementById('btn-salir').classList.add('hidden');
        document.getElementById('counter').classList.add('hidden');

        const total = state.q.length;
        const aciertos = state.ans.filter((a, i) => a && a.letra === state.q[i].correcta.toLowerCase()).length;
        const arriesgadas = state.ans.filter(a => a && a.arriesgada).length;
        const fallos = total - aciertos;
        const porcentaje = ((aciertos / total) * 100).toFixed(1);
        
        // Capturamos el tiempo formateado
        const tiempoTotal = app.formatTime(state.seconds);

        document.getElementById('final-stats').innerHTML = `
            <div class="dominio-container" style="display: flex; justify-content: center; width: 100%; margin-top: 20px;">
                <div class="dominio-card" style="width: 100%; max-width: 500px; padding: 30px; text-align: center; background: rgba(255,255,255,0.05); border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                    
                    <h2 style="margin: 0 0 15px 0;">DOMINIO FINAL</h2>
                    
                    <div class="dominio-porcentaje" style="font-size: 3.5em; font-weight: bold; line-height: 1; margin-bottom: 5px;">${porcentaje}%</div>
                    
                    <div style="font-size: 1.1em; opacity: 0.8; margin-bottom: 20px; color: #a5d6ff;">
                        ⏱️ Tiempo: ${tiempoTotal}
                    </div>

                    <div style="display: flex; gap: 20px; justify-content: center; font-weight: bold; font-size: 1.1em; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
                        <span style="color: var(--green);">✅ ${aciertos}</span>
                        <span style="color: var(--red);">❌ ${fallos}</span>
                        <span style="color: #ff9800;">⚠️ ${arriesgadas}</span>
                    </div>
                    
                    <p class="dominio-mensaje" style="margin-top: 20px; font-size: 0.9em; opacity: 0.7;">Has completado el test. Revisa tus fallos abajo.</p>
                </div>
            </div>
            <div id="revision-list" style="margin-top: 30px;"></div>`;
            
        app.renderRevision();
        
        if (state.currentIntentoId) {
            await sb.from('intentos').update({ 
                aciertos: aciertos, 
                fallos: fallos, 
                arriesgadas: arriesgadas,
                completado: true 
            }).eq('id', state.currentIntentoId);
        }
    },

    renderRevision: () => {
        const container = document.getElementById('revision-list');
        const listaTests = state.testsCache || [];

        const html = state.q.map((p, i) => {
            const res = state.ans[i];
            const esCorrecta = res && res.letra === p.correcta.toLowerCase();
            
            if (esCorrecta && (!res || !res.arriesgada)) return '';

            let uCol = res ? (esCorrecta ? "#ff9800" : "var(--red)") : "var(--text)";

            // --- 1. IDENTIFICADOR Y NOMBRE ---
            const testInfo = listaTests.find(t => t.id == p.test_id);
            
            let nombreTest = '';
            if (testInfo) {
                nombreTest = `${testInfo.identificador || ''} ${testInfo.nombre}`.trim();
            } else if (state.currentTestId == p.test_id) {
                nombreTest = state.currentTestName || '';
            }

            // --- 2. NÚMERO DE ORDEN ---
            const numPregunta = p.numero_orden || (i + 1);

            return `
                <div class="rev-item" style="border-left: 5px solid ${esCorrecta ? 'var(--green)' : 'var(--red)'}; padding: 15px; margin-bottom: 15px; background: rgba(255,255,255,0.03); text-align: left; border-radius: 4px;">
                    <div style="font-weight: bold; margin-bottom: 8px; color: ${esCorrecta ? 'var(--green)' : 'var(--red)'}">
                        ${esCorrecta ? '✅ ACERTADA (CON DUDA)' : '❌ FALLO'}
                    </div>
                    
                    <div style="font-size: 0.85em; color: var(--text); opacity: 0.9; margin-bottom: 8px; font-weight: bold; text-transform: uppercase;">
                        ${nombreTest}
                    </div>

                    <div style="margin-bottom: 12px; font-size: 1.05em;">
                        <strong>${numPregunta}.</strong> ${app.fixHTML(p.enunciado)}
                    </div>

                    <div style="font-size: 0.95em; margin-bottom: 5px;">
                        <span style="opacity: 0.8;">Tu respuesta:</span>
                        <strong style="color: ${uCol};">
                            ${res ? res.letra.toUpperCase() + ') ' + app.fixHTML(p['opcion_' + res.letra]) : 'No contestada'}
                        </strong>
                    </div>
                    <div style="font-size: 0.95em;">
                        <span style="opacity: 0.8;">Respuesta correcta:</span>
                        <strong style="color: var(--green);">
                            ${p.correcta.toUpperCase()}) ${app.fixHTML(p['opcion_' + p.correcta.toLowerCase()])}
                        </strong>
                    </div>
                    ${p.feedback ? `<div style="margin-top: 12px; padding: 10px; background: rgba(88,166,255,0.1); border-radius: 4px; font-style: italic; font-size: 0.9em; color: #a5d6ff;">💡 ${p.feedback}</div>` : ''}
                </div>`;
        }).join('');
        
        container.innerHTML = "<h3 style='margin-top:40px; border-bottom: 1px solid #30363d; padding-bottom:10px;'>Revisión de Errores y Dudas</h3>" + (html || '<p style="color:var(--green)">¡Examen perfecto!</p>');
    },

    switchView: (id) => {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');
    },

    renderDashboard: async () => {
        app.switchView('view-stats');
        const listBloques = document.getElementById('stats-bloques-list');
        listBloques.innerHTML = "<p style='text-align:center; opacity:0.5;'>Analizando base de datos...</p>";

        // --- NUEVO: SI HAY UN TEST CORRIENDO EN MEMORIA ---
        // Si el timer está activo, significa que el usuario ha navegado aquí sin querer (o para mirar algo)
        // pero el test sigue vivo en segundo plano.
        if (state.timerInterval && state.q.length > 0) {
            const dashboard = document.getElementById('view-stats');
            
            // Si ya existe el botón de volver, no lo creamos otra vez
            if (!document.getElementById('btn-back-to-test')) {
                const divVolver = document.createElement('div');
                divVolver.id = 'btn-back-to-test';
                // Usamos la misma clase bonita que creamos antes
                divVolver.className = 'resume-card';
                // Le cambiamos el color a verde para diferenciarlo de "Recuperar backup"
                divVolver.style.borderColor = "var(--green)";
                divVolver.style.background = "rgba(46, 160, 67, 0.15)";
                
                divVolver.innerHTML = `
                    <h3 style="color: var(--green); margin: 0 0 10px 0; font-size: 1.1em; text-transform: uppercase; letter-spacing: 1px;">
                        🚀 TEST EN CURSO
                    </h3>
                    <p style="margin: 0 0 15px 0; font-size: 0.95em; opacity: 0.9;">
                        El cronómetro sigue corriendo...<br>
                        <strong>${state.currentTestName}</strong>
                    </p>
                    <button onclick="app.switchView('view-test')" style="background: var(--green); color: #000; border: none; padding: 10px 25px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 1em; transition: transform 0.2s;">
                        VOLVER AL TEST
                    </button>
                `;
                
                // Lo insertamos al principio del todo
                dashboard.insertBefore(divVolver, dashboard.firstChild);
            }
        }
        // -----------------------------------------------------
        
        try {
            const [intentosRes, testsRes, bloquesRes] = await Promise.all([
                sb.from('intentos').select('*').order('id', { ascending: false }),
                sb.from('tests').select('id, nombre, identificador, temas(nombre, bloque_id)'), 
                sb.from('bloques').select('id, nombre')
            ]);
    
            if (intentosRes.error || testsRes.error || bloquesRes.error) throw new Error("Error de red");
            
            const todosLosIntentos = (intentosRes.data || []).filter(i => i.completado);
            const todosLosTests = testsRes.data || [];
            const todosLosBloques = bloquesRes.data || [];
    
            if (todosLosIntentos.length === 0) {
                listBloques.innerHTML = "<p style='text-align:center; padding:20px; opacity:0.6;'>No hay datos todavía. ¡Completa un test!</p>"; 
                return;
            }
    
            const ultimosIntentosPorTest = {};
            todosLosIntentos.forEach(intento => {
                if (!ultimosIntentosPorTest[intento.test_id]) {
                    ultimosIntentosPorTest[intento.test_id] = intento;
                }
            });

            const statsMap = {};
    
            Object.values(ultimosIntentosPorTest).forEach(i => {
                const testInfo = todosLosTests.find(t => t.id === i.test_id);
                if (!testInfo) return;
    
                const bId = testInfo.temas?.bloque_id || 0; 
                const bloqueNombre = todosLosBloques.find(b => b.id === bId)?.nombre || "OTROS / VARIOS";
                
                if (!statsMap[bId]) {
                    statsMap[bId] = { nombre: bloqueNombre, porcentajesTests: [], testsDetalle: [] };
                }

                const totalRespondidas = i.aciertos + i.fallos;
                const pTest = totalRespondidas > 0 ? (i.aciertos / totalRespondidas) * 100 : 0;
                
                statsMap[bId].porcentajesTests.push(pTest);
                statsMap[bId].testsDetalle.push({
                    id: i.test_id,
                    nombre: testInfo.nombre,
                    identificador: testInfo.identificador,
                    porcentaje: pTest.toFixed(0)
                });
            });
    
            const todosLosPorcentajes = Object.values(statsMap).flatMap(b => b.porcentajesTests);
            const porcentajeGlobal = (todosLosPorcentajes.reduce((a, b) => a + b, 0) / todosLosPorcentajes.length).toFixed(1);
            const totalRespondidasGlobal = todosLosIntentos.reduce((a, c) => a + (c.aciertos + c.fallos), 0);
            const diasEstudiados = [...new Set(todosLosIntentos.map(i => i.fecha?.split('T')[0]))].filter(Boolean).length;
    
            document.getElementById('stat-total-preguntas').innerText = totalRespondidasGlobal;
            document.getElementById('stat-acierto-global').innerText = `${porcentajeGlobal}%`;
            document.getElementById('stat-racha').innerText = diasEstudiados;
    
            listBloques.innerHTML = Object.keys(statsMap)
                .sort((a, b) => {
                    const nameA = statsMap[a].nombre.toUpperCase();
                    const nameB = statsMap[b].nombre.toUpperCase();
                    if (nameA.includes("EXÁMENES") || nameA.includes("SIMULACRO")) return 1;
                    if (nameB.includes("EXÁMENES") || nameB.includes("SIMULACRO")) return -1;
                    return a - b;
                })
                .map(bId => {
                    const s = statsMap[bId];
                    const pBloque = (s.porcentajesTests.reduce((a, b) => a + b, 0) / s.porcentajesTests.length).toFixed(0);
                    const colorBloque = pBloque >= 70 ? 'var(--green)' : pBloque >= 40 ? '#d29922' : 'var(--red)';
    
                    return `
                        <details class="bloque-container">
                            <summary class="bloque-header">
                                <div style="flex-grow:1">
                                    <div style="display:flex; justify-content:space-between; margin-bottom:5px; padding-right:15px;">
                                        <span>📦 ${s.nombre}</span>
                                        <span style="color:${colorBloque}">${pBloque}%</span>
                                    </div>
                                    <div class="progress-bg" style="margin:0; height:6px;">
                                        <div class="progress-fill" style="width:${pBloque}%; background:${colorBloque}"></div>
                                    </div>
                                </div>
                            </summary>
                            <div class="bloque-content">
                                ${s.testsDetalle.map(t => `
                                    <div class="test-row" onclick="app.start(${t.id})" style="display:flex; justify-content:space-between; align-items:center; background: rgba(255,255,255,0.02); margin: 4px 0; border-bottom: 1px solid #30363d;">
                                        <div style="font-size:0.9em;">
                                            <span class="tag-id">${t.identificador || 'TEST'}</span>
                                            <strong>${t.nombre}</strong>
                                        </div>
                                        <span style="font-weight:bold; color:${t.porcentaje >= 70 ? 'var(--green)' : '#888'}">${t.porcentaje}%</span>
                                    </div>
                                `).join('')}
                            </div>
                        </details>
                    `;
                }).join('');
    
        } catch (err) { 
            console.error("Error Dashboard:", err); 
            listBloques.innerHTML = `<p style='color:var(--red); text-align:center;'>Error al cargar estadísticas: ${err.message}</p>`; 
        }
    },

    // --- FUNCIÓN RECUPERADA ---
    confirmarSalida: async () => { 
        // 1. Lo primero es parar el timer visualmente para que no agobie mientras decide
        app.stopTimer(); 
        
        // 2. Preguntamos al usuario
        if(confirm("¿Deseas salir al menú principal?")) {
            
            // --- AQUÍ ESTÁ EL CAMBIO ---
            // Solo borramos si el usuario confirma (Acepta)
            // Usamos await para asegurar que se borre antes de recargar
            await app.borrarProgreso(); 
            
            location.reload(); 
        } else {
            // 3. Si se arrepiente (Cancela), NO hemos borrado nada.
            // Simplemente reanudamos el timer y sigue jugando.
            app.startTimer(); 
        }
    },

    resetStats: async () => {
        const confirmar = confirm("⚠️ ¿ESTÁS SEGURO? Se borrarán todos tus intentos y errores de forma permanente.");
        if (!confirmar) return;

        try {
            const resErrores = await sb.from('errores').delete().gt('id', 0);
            const resIntentos = await sb.from('intentos').delete().gt('id', 0);

            if (resErrores.error || resIntentos.error) {
                throw new Error(resErrores.error?.message || resIntentos.error?.message);
            }

            alert("Estadísticas borradas correctamente.");
            location.reload();
        } catch (err) {
            alert("Error al borrar: " + err.message);
        }
    },

    prepararRepasoPorNombreTema: async (nombreTema) => {
        try {
            const slider = document.getElementById('tema-range');
            const limite = slider ? parseInt(slider.value, 10) : 100;
            const modoRadio = document.querySelector('input[name="tema-modo"]:checked');
            const modo = modoRadio ? modoRadio.value : 'fallos'; 

            const testsDelTema = state.testsCache.filter(t => t.temas && t.temas.nombre === nombreTema);
            const idsTests = testsDelTema.map(t => t.id);
            if (idsTests.length === 0) return alert("No hay tests asociados a este tema.");

            let rawData = [];

            if (modo === 'fallos') {
                const { data: fallos, error: errorFallos } = await sb.from('errores').select('pregunta_id').in('test_id', idsTests);
                if (errorFallos) throw errorFallos;
                if (!fallos || fallos.length === 0) return alert("✅ ¡Genial! No tienes fallos registrados en este tema.");

                const idsPreguntas = fallos.map(f => f.pregunta_id);
                const { data, error } = await sb.from('preguntas').select('*').in('id', idsPreguntas);
                if (error) throw error;
                rawData = data;

            } else {
                const { data, error } = await sb.from('preguntas').select('*').in('test_id', idsTests);
                if (error) throw error;
                rawData = data;
            }

            if (!rawData || rawData.length === 0) return alert("No se encontraron preguntas.");

            rawData.sort(() => Math.random() - 0.5);
            const preguntasFinales = rawData.slice(0, limite);

            app.resetState();
            state.q = preguntasFinales;
            
            const icono = modo === 'fallos' ? '⚠️' : '📚';
            const etiqueta = modo === 'fallos' ? 'REPASO FALLOS' : 'TEST TEMA';
            state.currentTestName = `${icono} ${etiqueta}: ${nombreTema} (${state.q.length})`;
            state.currentTestId = null; 

            app.switchView('view-test');
            document.getElementById('modal-temas').classList.add('hidden');
            document.getElementById('btn-salir').classList.remove('hidden');
            app.startTimer();
            app.render();

        } catch (err) {
            console.error(err);
            alert("Error al cargar el tema.");
        }
    },

    prepararRepasoPorTestId: async (testId, nombreTest) => {
        try {
            const slider = document.getElementById('tema-range');
            const limite = slider ? parseInt(slider.value, 10) : 100;
            const modoRadio = document.querySelector('input[name="tema-modo"]:checked');
            const modo = modoRadio ? modoRadio.value : 'fallos';

            let rawData = [];

            if (modo === 'fallos') {
                const { data: fallos, error: errorFallos } = await sb.from('errores').select('pregunta_id').eq('test_id', testId);
                if (errorFallos) throw errorFallos;
                if (!fallos || fallos.length === 0) return alert("✅ ¡Genial! No tienes fallos en este test.");

                const idsPreguntas = fallos.map(f => f.pregunta_id);
                const { data, error } = await sb.from('preguntas').select('*').in('id', idsPreguntas);
                if (error) throw error;
                rawData = data;

            } else {
                const { data, error } = await sb.from('preguntas').select('*').eq('test_id', testId);
                if (error) throw error;
                rawData = data;
            }

            if (!rawData || rawData.length === 0) return alert("Este test está vacío.");

            rawData.sort(() => Math.random() - 0.5);
            const preguntasFinales = rawData.slice(0, limite);

            app.resetState();
            state.q = preguntasFinales;
            
            const icono = modo === 'fallos' ? '⚠️' : '📝';
            
            const textoModo = modo === 'fallos' ? 'REPASO FALLOS: ' : ''; 
            
            state.currentTestName = `${icono} ${textoModo}${nombreTest} (${state.q.length})`;

            state.currentTestId = testId;

            app.switchView('view-test');
            document.getElementById('modal-temas').classList.add('hidden');
            document.getElementById('btn-salir').classList.remove('hidden');
            app.startTimer();
            app.render();

        } catch (err) {
            console.error(err);
            alert("Error al cargar el test.");
        }
    },
    
    startRepasoTema: (nombre) => {
        app.prepararRepasoPorNombreTema(nombre);
    }

}; // FIN DEL OBJETO APP

// --- FUNCIONES AUXILIARES FUERA DEL OBJETO APP ---

function renderTestButton(t, isHecho) {
    const hechoStr = isHecho ? ' ✅' : '';
    const badgeClass = t.tipo === 'examen_simulacro' ? 'badge-blue' : 'tag-id';
    const badgeText = t.identificador || (t.tipo === 'examen_simulacro' ? 'OFICIAL' : 'TEST');

    if (t.info) {
        const safeInfo = t.info.replace(/"/g, '&quot;');
        return `
        <div class="test-row-complex">
            <div class="test-main-part" onclick="app.start(${t.id})">
                <span class="${badgeClass}">${badgeText}</span>
                <strong>${t.nombre}${hechoStr}</strong>
            </div>
            <div class="test-info-part" data-msg="${safeInfo}" onclick="alert(this.dataset.msg)">
                ℹ️
            </div>
        </div>`;
    }

    return `
    <div class="test-row ${t.tipo === 'examen_simulacro' ? 'oficial-row' : ''}" onclick="app.start(${t.id})">
        <span class="${badgeClass}">${badgeText}</span>
        <strong>${t.nombre}${hechoStr}</strong> 
    </div>`;
}

// --- EXTENSIONES DEL OBJETO APP (FUNCIONALIDAD MULTI-TEMA) ---

app.abrirModalRepasoTema = () => {
    const modal = document.getElementById('modal-temas');
    const listContainer = document.getElementById('lista-temas-repaso');
    
    const spanCount = document.getElementById('count-sel');
    if(spanCount) spanCount.innerText = "0";

    listContainer.innerHTML = "";
    modal.classList.remove('hidden');

    if (!state.bloquesCache || !state.testsCache) {
        listContainer.innerHTML = "<p>Cargando datos...</p>";
        return;
    }

    const bloquesOrdenados = [...state.bloquesCache].sort((a, b) => {
        const nombreA = a.nombre.toUpperCase();
        const nombreB = b.nombre.toUpperCase();
        const esExamenA = nombreA.includes("OFICIAL") || nombreA.includes("SIMULACRO") || nombreA.includes("EXÁMENES");
        const esExamenB = nombreB.includes("OFICIAL") || nombreB.includes("SIMULACRO") || nombreB.includes("EXÁMENES");
        if (esExamenA && !esExamenB) return 1;
        if (!esExamenA && esExamenB) return -1;
        return nombreA.localeCompare(nombreB, undefined, { numeric: true });
    });

    bloquesOrdenados.forEach(bloque => {
        const testsDelBloque = state.testsCache.filter(t => t.temas && t.temas.bloque_id === bloque.id);
        if (testsDelBloque.length === 0) return;

        const esBloqueExamen = bloque.nombre.toUpperCase().includes("EXÁMENES") || 
                               bloque.nombre.toUpperCase().includes("SIMULACRO") || 
                               bloque.nombre.toUpperCase().includes("OFICIAL");

        let itemsParaMostrar = [];

        if (esBloqueExamen) {
            testsDelBloque.sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true }));
            
            itemsParaMostrar = testsDelBloque.map(t => ({
                label: t.nombre,
                valor: t.nombre, 
                esTest: true,
                id: t.id
            }));

        } else {
            const temasUnicos = [...new Set(testsDelBloque.map(t => t.temas.nombre))].sort();
            
            itemsParaMostrar = temasUnicos.map(tema => ({
                label: tema,
                valor: tema,
                esTest: false
            }));
        }

        const detalles = document.createElement('details');
        detalles.className = 'bloque-container';
        
        const itemsHtml = itemsParaMostrar.map(item => {
            const safeValor = item.valor.replace(/'/g, "\\'");
            
            const clickFunction = item.esTest 
                ? `app.prepararRepasoPorTestId(${item.id}, '${safeValor}')` 
                : `app.prepararRepasoPorNombreTema('${safeValor}')`;

            return `
                <div class="tema-row">
                    <span class="tema-label" onclick="${clickFunction}">
                        ${item.esTest ? '📄 ' : ''}${item.label}
                    </span>
                    <input type="checkbox" class="tema-chk" value="${item.valor}" onchange="app.updateMultiCount()">
                </div>
            `;
        }).join('');

        detalles.innerHTML = `
            <summary class="bloque-header">
                <span>📦 ${bloque.nombre}</span>
                <small>${itemsParaMostrar.length} ${esBloqueExamen ? 'tests' : 'temas'}</small>
            </summary>
            <div class="bloque-content">
                ${itemsHtml}
            </div>
        `;
        listContainer.appendChild(detalles);
    });
};

app.updateMultiCount = () => {
    const checked = document.querySelectorAll('.tema-chk:checked').length;
    const span = document.getElementById('count-sel');
    if(span) span.innerText = checked;
};

app.startRepasoMultiTema = async () => {
    try {
        const checkboxes = document.querySelectorAll('.tema-chk:checked');
        const seleccionados = Array.from(checkboxes).map(cb => cb.value);

        if (seleccionados.length === 0) return alert("⚠️ Selecciona al menos un tema o test.");

        document.getElementById('modal-temas').classList.add('hidden');

        const slider = document.getElementById('tema-range');
        const limite = slider ? parseInt(slider.value, 10) : 50; 
        const modoRadio = document.querySelector('input[name="tema-modo"]:checked');
        const modo = modoRadio ? modoRadio.value : 'todo'; 

        const mapTestIdToSeleccion = {};
        
        const testsCoincidentes = state.testsCache.filter(t => {
            if (t.temas && seleccionados.includes(t.temas.nombre)) {
                mapTestIdToSeleccion[t.id] = t.temas.nombre; 
                return true;
            }
            if (seleccionados.includes(t.nombre)) {
                mapTestIdToSeleccion[t.id] = t.nombre; 
                return true;
            }
            return false;
        });
        
        const idsTests = testsCoincidentes.map(t => t.id);

        if (idsTests.length === 0) return alert("No se encontraron tests para la selección.");

        let rawData = [];

        if (modo === 'fallos') {
            const { data: fallos, error } = await sb.from('errores').select('pregunta_id, test_id').in('test_id', idsTests);
            if (error) throw error;
            if (!fallos || fallos.length === 0) return alert("✅ ¡Genial! No tienes fallos registrados en lo seleccionado.");
            
            const idsPreguntas = fallos.map(f => f.pregunta_id);
            const { data: preguntas, error: errP } = await sb.from('preguntas').select('*').in('id', idsPreguntas);
            if (errP) throw errP;
            
            rawData = preguntas.map(p => p); 

        } else {
            const { data: preguntas, error } = await sb.from('preguntas').select('*').in('test_id', idsTests);
            if (error) throw error;
            rawData = preguntas;
        }

        if (!rawData || rawData.length === 0) return alert("No se encontraron preguntas disponibles.");

        const bolsas = {};
        seleccionados.forEach(sel => bolsas[sel] = []);

        rawData.forEach(p => {
            const grupo = mapTestIdToSeleccion[p.test_id];
            if (grupo && bolsas[grupo]) {
                bolsas[grupo].push(p);
            }
        });

        Object.values(bolsas).forEach(lista => lista.sort(() => Math.random() - 0.5));

        const preguntasFinales = [];
        let buscando = true;

        while (preguntasFinales.length < limite && buscando) {
            buscando = false;
            for (const key of seleccionados) {
                if (preguntasFinales.length >= limite) break;
                
                if (bolsas[key].length > 0) {
                    preguntasFinales.push(bolsas[key].pop());
                    buscando = true; 
                }
            }
        }

        preguntasFinales.sort(() => Math.random() - 0.5);

        const preguntasConInfo = preguntasFinales.map(p => {
            const testOrigen = state.testsCache.find(t => t.id === p.test_id);
            return {
                ...p,
                nombre_test: testOrigen ? testOrigen.nombre : 'Test Varios'
            };
        });

        app.resetState();
        state.q = preguntasConInfo;

        const icono = modo === 'fallos' ? '⚠️' : '📚';
        const textoModo = modo === 'fallos' ? ' REPASO FALLOS:' : ''; 
        
        const nombreSeleccion = seleccionados.length === 1 ? seleccionados[0] : "MULTI-TEMA";
        
        state.currentTestName = `${icono}${textoModo} ${nombreSeleccion} (${preguntasConInfo.length} PREGUNTAS)`;

        state.mode = document.querySelector('input[name="modo"]:checked').value;

        app.switchView('view-test');
        document.getElementById('btn-salir').classList.remove('hidden');
        app.startTimer();
        app.render();

    } catch (error) {
        console.error(error);
        alert("Error generando el test multi-selección.");
    }
};

// --- INICIALIZACIÓN ---
window.onload = app.init;

// --- CONTROLADOR DE TECLADO ---
document.addEventListener('keydown', (e) => {
    if (!document.getElementById('view-test').classList.contains('hidden')) {
        const key = e.key.toLowerCase();
        
        if (['a', 'b', 'c', 'd'].includes(key)) {
            const index = ['a', 'b', 'c', 'd'].indexOf(key);
            const buttons = document.querySelectorAll('#q-options .option-btn');
            if (buttons[index]) {
                buttons[index].click();
            }
        }
        
        if (key === 'r') {
            app.toggleArriesgando();
        }
        
        if (e.code === 'Space') {
            e.preventDefault();
            const btnAccion = document.getElementById('btn-accion');
            if (btnAccion && !btnAccion.disabled) {
                btnAccion.click();
            }
        }
    }
});
