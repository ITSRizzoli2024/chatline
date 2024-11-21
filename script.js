let userAgent;
let session;
const DEFAULT_NUMBER = '123456';
let isConnected = false;

const statusDisplay = document.getElementById('status');
const callBtn = document.getElementById('callBtn');
const hangupBtn = document.getElementById('hangupBtn');

// Gestione tastierino DTMF
document.querySelectorAll('.dialpad-button').forEach(button => {
    button.addEventListener('click', () => {
        const tone = button.textContent;
        sendDTMF(tone);
    });
});

// Gestione input da tastiera
document.addEventListener('keydown', (event) => {
    const key = event.key;
    if (session && session.state === SIP.SessionState.Established) {
        if (/^[0-9*#]$/.test(key)) {
            sendDTMF(key);
        }
    }
});

callBtn.addEventListener('click', async () => {
    // Disabilita il pulsante durante la connessione
    callBtn.disabled = true;
    
    if (!isConnected) {
        try {
            await connect();
            // Aspetta un momento per assicurarsi che la registrazione sia completata
            setTimeout(() => makeCall(), 1000);
        } catch (error) {
            console.error('Errore durante la connessione:', error);
            callBtn.disabled = false;
        }
    } else {
        makeCall();
    }
});

hangupBtn.addEventListener('click', hangup);

function sendDTMF(tone) {
    if (session && session.state === SIP.SessionState.Established) {
        console.log('Invio tono DTMF:', tone);
        
        try {
            if (session.sessionDescriptionHandler && 
                session.sessionDescriptionHandler.peerConnection) {
                
                const sender = session.sessionDescriptionHandler.peerConnection
                    .getSenders()
                    .find(sender => sender.track && sender.track.kind === 'audio');
                
                if (sender && sender.dtmf) {
                    sender.dtmf.insertDTMF(tone, 100, 70);
                    console.log('DTMF inviato correttamente');
                    
                    // Feedback visivo
                    const button = Array.from(document.querySelectorAll('.dialpad-button'))
                        .find(btn => btn.textContent === tone);
                    if (button) {
                        button.style.backgroundColor = '#d0d0d0';
                        setTimeout(() => {
                            button.style.backgroundColor = button.classList.contains('special') ? '#e8f5e9' : '#f0f0f0';
                        }, 100);
                    }

                    playDTMFTone(tone);
                }
            }
        } catch (error) {
            console.error('Errore nell\'invio del DTMF:', error);
        }
    }
}

async function connect() {
    try {
        userAgent = new SIP.UserAgent({
            uri: new SIP.URI('sip', 'MariaMaddalena', '1tel.it'),
            transportOptions: {
                wsServers: ['wss://1tel.it:8089/ws']
            },
            authorizationUsername: 'MariaMaddalena',
            authorizationPassword: 'b29a0476-b83b-4cc9-a5a9-93bd18be600f',
            displayName: 'WebRTC Phone',
            noAnswerTimeout: 60,
            register: true,
            sessionDescriptionHandlerFactoryOptions: {
                constraints: {
                    audio: true,
                    video: false
                }
            },
            delegate: {
                onConnect: () => {
                    console.log('Connesso al server WebSocket');
                    statusDisplay.textContent = 'Stato: Connesso a 1tel.it';
                    isConnected = true;
                },
                onDisconnect: (error) => {
                    console.log('Disconnesso dal server WebSocket', error);
                    statusDisplay.textContent = 'Stato: Disconnesso';
                    isConnected = false;
                    callBtn.disabled = false;
                    hangupBtn.disabled = true;
                },
                onInvite: (invitation) => {
                    session = invitation;
                    setupSession();
                    session.accept();
                },
                onRegistered: () => {
                    console.log('Registrazione completata');
                    statusDisplay.textContent = 'Stato: Registrato';
                },
                onUnregistered: () => {
                    console.log('Non registrato');
                    statusDisplay.textContent = 'Stato: Non registrato';
                    isConnected = false;
                },
                onRegistrationFailed: (error) => {
                    console.error('Registrazione fallita', error);
                    statusDisplay.textContent = 'Stato: Errore di registrazione';
                    callBtn.disabled = false;
                }
            }
        });

        await userAgent.start();
        const registerer = new SIP.Registerer(userAgent, {
            expires: 300
        });
        await registerer.register();

    } catch (error) {
        console.error('Errore di connessione:', error);
        statusDisplay.textContent = 'Stato: Errore di connessione - ' + error.message;
        callBtn.disabled = false;
        throw error;
    }
}

async function makeCall() {
    try {
        console.log('Avvio chiamata verso:', DEFAULT_NUMBER);
        const target = new SIP.URI('sip', DEFAULT_NUMBER, '1tel.it');

        const options = {
            sessionDescriptionHandlerOptions: {
                constraints: {
                    audio: true,
                    video: false
                }
            }
        };

        session = new SIP.Inviter(userAgent, target, options);
        setupSession();
        await session.invite();
        console.log('Invito inviato');

    } catch (error) {
        console.error('Errore durante la chiamata:', error);
        statusDisplay.textContent = 'Stato: Errore durante la chiamata';
        callBtn.disabled = false;
    }
}

function setupSession() {
    session.delegate = {
        onSessionDescriptionHandler: (sdh) => {
            sdh.peerConnectionDelegate = {
                ontrack: (event) => {
                    console.log('Track ricevuto:', event);
                    const remoteAudio = document.getElementById('remoteAudioElement');
                    if (event.track.kind === 'audio') {
                        const stream = new MediaStream([event.track]);
                        remoteAudio.srcObject = stream;
                    }
                }
            };
        }
    };

    session.stateChange.addListener((newState) => {
        console.log('Stato sessione:', newState);
        switch (newState) {
            case SIP.SessionState.Establishing:
                statusDisplay.textContent = 'Stato: Connessione in corso...';
                break;
            case SIP.SessionState.Established:
                statusDisplay.textContent = 'Stato: Chiamata in corso';
                callBtn.disabled = true;
                hangupBtn.disabled = false;
                break;
            case SIP.SessionState.Terminated:
                statusDisplay.textContent = 'Stato: Chiamata terminata';
                callBtn.disabled = false;
                hangupBtn.disabled = true;
                break;
            case SIP.SessionState.Failed:
                statusDisplay.textContent = 'Stato: Chiamata fallita';
                callBtn.disabled = false;
                hangupBtn.disabled = true;
                break;
        }
    });
}

function hangup() {
    if (session) {
        console.log('Termino la chiamata');
        session.bye();
    }
}

function playDTMFTone(tone) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    const dtmfFrequencies = {
        '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
        '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
        '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
        '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
    };

    if (dtmfFrequencies[tone]) {
        const [freq1, freq2] = dtmfFrequencies[tone];
        const duration = 0.100;

        const osc1 = audioContext.createOscillator();
        const osc2 = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        osc1.frequency.value = freq1;
        osc2.frequency.value = freq2;
        gainNode.gain.value = 0.1;

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(audioContext.destination);

        osc1.start();
        osc2.start();

        setTimeout(() => {
            osc1.stop();
            osc2.stop();
        }, duration * 1000);
    }
}

SCAN
HISTORY
Paste your content here to scan...
DETECT AI SCAN
CHECK PLAGIARISM