import { useCallback, useEffect, useRef, useState } from "react";
import "./App.scss";

import walk01 from "./assets/anime-walk-01.png";
import walk02 from "./assets/anime-walk-02.png";
import walk03 from "./assets/anime-walk-03.png";
import walk04 from "./assets/anime-walk-04.png";
import walk05 from "./assets/anime-walk-05.png";
import walk06 from "./assets/anime-walk-06.png";
import walk07 from "./assets/anime-walk-07.png";
import walk08 from "./assets/anime-walk-08.png";

const WALK_FRAMES = [
  walk01, walk02, walk03, walk04,
  walk05, walk06, walk07, walk08,
];

const CHARACTER_WIDTH = 120;
const WALK_SPEED = 2;
const SEGMENT_MS = 4000;
const COMMAND_WAIT_MS = 8000;

const GREETINGS = [
  "Hello! How can I help you?",
  "Hey there! I'm Jarwis.",
  "Hello! Nice to see you.",
  "I'm here. What's up?",
];

function AnimeBoy({ isWalking, facing, onClick }) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!isWalking) return;

    const timer = setInterval(() => {
      setFrameIndex((frame) => (frame + 1) % WALK_FRAMES.length);
    }, 100);

    return () => clearInterval(timer);
  }, [isWalking]);

  return (
    <button
      type="button"
      className={`anime-character ${facing === "left" ? "face-left" : "face-right"}`}
      onClick={onClick}
      title="Click Jarwis to say hello"
      aria-label="Jarwis anime character"
    >
      <img
        src={WALK_FRAMES[frameIndex]}
        alt="Jarwis walking anime character"
        draggable="false"
      />
    </button>
  );
}

export default function App() {
  const [position, setPosition] = useState(0);
  const [facing, setFacing] = useState("right");
  const [isWalking, setIsWalking] = useState(true);
  const [showGreeting, setShowGreeting] = useState(false);
  const [greeting, setGreeting] = useState("");

  const [voiceMode, setVoiceMode] = useState("offline");
  const [voiceStatus, setVoiceStatus] = useState("Starting microphone...");
  const [isWaitingForCommand, setIsWaitingForCommand] = useState(false);
  const [clickThrough, setClickThrough] = useState(false);

  const positionRef = useRef(0);
  const directionRef = useRef(1);
  const walkingRef = useRef(true);

  const voiceModeRef = useRef("offline");
  const waitingRef = useRef(false);
  const streamRef = useRef(null);
  const stoppedRef = useRef(false);
  const commandTimerRef = useRef(null);
  const greetingTimerRef = useRef(null);
  const processingQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    walkingRef.current = isWalking;
  }, [isWalking]);

  const showRandomGreeting = useCallback((message) => {
    setGreeting(
      message || GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
    );
    setShowGreeting(true);

    clearTimeout(greetingTimerRef.current);
    greetingTimerRef.current = setTimeout(() => {
      setShowGreeting(false);
    }, 3500);
  }, []);

  const stopWaiting = useCallback(() => {
    waitingRef.current = false;
    setIsWaitingForCommand(false);
    clearTimeout(commandTimerRef.current);
    commandTimerRef.current = null;
  }, []);

  const startWaiting = useCallback(() => {
    waitingRef.current = true;
    setIsWaitingForCommand(true);
    setVoiceStatus('Listening for a command. Say "stop" or "walk".');

    clearTimeout(commandTimerRef.current);
    commandTimerRef.current = setTimeout(() => {
      stopWaiting();
      setVoiceStatus('Voice ready. Say "Hello Jarwis".');
    }, COMMAND_WAIT_MS);
  }, [stopWaiting]);

  const handleTranscript = useCallback((rawText) => {
    const text = (rawText || "")
      .toLowerCase()
      .replace(/[.,!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) return;

    console.log("JARWIS transcript:", text);

    const wakeWord = /\b(jarwis|jarvis|jervis)\b/i.test(text);
    const saysHello = /\b(hello|hi|hey)\b/i.test(text);
    const saysStop = /\b(stop|freeze|halt|pause)\b/i.test(text);
    const saysWalk = /\b(walk|start|move|resume|continue)\b/i.test(text);

    if (wakeWord && saysStop) {
      stopWaiting();
      walkingRef.current = false;
      setIsWalking(false);
      setVoiceStatus('Jarwis stopped. Say "Hello Jarwis" to continue.');
      showRandomGreeting("Okay, I'll stop here.");
      return;
    }

    if (wakeWord && saysWalk) {
      stopWaiting();
      walkingRef.current = true;
      setIsWalking(true);
      setVoiceStatus('Jarwis is walking. Say "Hello Jarwis" for another command.');
      showRandomGreeting("Okay! Let's walk.");
      return;
    }

    if (wakeWord && (saysHello || text === "jarwis" || text === "jarvis" || text === "jervis")) {
      startWaiting();
      showRandomGreeting("Yes? I'm listening.");
      return;
    }

    if (waitingRef.current) {
      if (saysStop) {
        stopWaiting();
        walkingRef.current = false;
        setIsWalking(false);
        setVoiceStatus('Jarwis stopped. Say "Hello Jarwis" to continue.');
        showRandomGreeting("Okay, I'll stay here.");
        return;
      }

      if (saysWalk) {
        stopWaiting();
        walkingRef.current = true;
        setIsWalking(true);
        setVoiceStatus('Jarwis is walking. Say "Hello Jarwis" for another command.');
        showRandomGreeting("I'm walking again.");
        return;
      }

      setVoiceStatus('I heard you. Try "stop" or "walk".');
    }
  }, [showRandomGreeting, startWaiting, stopWaiting]);

  // Keep the character walking between the screen edges.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!walkingRef.current) return;

      const max = Math.max(0, window.innerWidth - CHARACTER_WIDTH);
      let next = positionRef.current + directionRef.current * WALK_SPEED;

      if (next >= max) {
        next = max;
        directionRef.current = -1;
        setFacing("left");
      } else if (next <= 0) {
        next = 0;
        directionRef.current = 1;
        setFacing("right");
      }

      positionRef.current = next;
      setPosition(next);
    }, 30);

    return () => clearInterval(timer);
  }, []);

  // Automatically capture audio and send each completed segment to Electron.
  useEffect(() => {
    let cancelled = false;
    stoppedRef.current = false;

    async function startMicrophone() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setVoiceStatus("Microphone capture is unavailable in this environment.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (cancelled || stoppedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        setVoiceStatus('Microphone active. Say "Hello Jarwis".');

        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";

        function startSegment() {
          if (cancelled || stoppedRef.current) return;

          let recorder;

          try {
            recorder = new MediaRecorder(stream, { mimeType });
          } catch (error) {
            console.error(error);
            setVoiceStatus("Could not initialize audio recording.");
            return;
          }

          const chunks = [];

          recorder.ondataavailable = (event) => {
            if (event.data?.size) chunks.push(event.data);
          };

          recorder.onerror = (event) => {
            console.error("Recorder error:", event.error);
          };

          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });

            // Start recording the next segment while this one is transcribed.
            if (!cancelled && !stoppedRef.current) {
              startSegment();
            }

            if (!blob.size) return;

            processingQueueRef.current = processingQueueRef.current
              .then(async () => {
                if (cancelled || stoppedRef.current) return;

                const buffer = await blob.arrayBuffer();
                const bytes = new Uint8Array(buffer);

                let binary = "";
                for (let i = 0; i < bytes.length; i += 1) {
                  binary += String.fromCharCode(bytes[i]);
                }

                const result = await window.buddy.transcribeAudio({
                  audioBase64: btoa(binary),
                  mimeType: blob.type || mimeType,
                  preferredMode: voiceModeRef.current,
                });

                if (cancelled || stoppedRef.current) return;

                if (result.fallback) {
                  setVoiceStatus("Offline engine failed; using online recognition.");
                } else if (result.mode === "online") {
                  setVoiceStatus("Online voice recognition active.");
                } else {
                  setVoiceStatus('Offline voice recognition active. Say "Hello Jarwis".');
                }

                if (result.text) handleTranscript(result.text);
              })
              .catch((error) => {
                console.error("Transcription failed:", error);
                if (!cancelled && !stoppedRef.current) {
                  setVoiceStatus(`Voice error: ${error.message}`);
                }
              });
          };

          try {
            recorder.start();
            setTimeout(() => {
              if (recorder.state === "recording") recorder.stop();
            }, SEGMENT_MS);
          } catch (error) {
            console.error("Could not start recording:", error);
            setVoiceStatus("Could not start microphone recording.");
          }
        }

        startSegment();
      } catch (error) {
        console.error("Microphone access failed:", error);
        setVoiceStatus(
          "Microphone access failed. Check Windows microphone privacy settings."
        );
      }
    }

    startMicrophone();

    return () => {
      cancelled = true;
      stoppedRef.current = true;
      clearTimeout(commandTimerRef.current);
      clearTimeout(greetingTimerRef.current);

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [handleTranscript]);

  useEffect(() => {
    if (!window.buddy?.onClickMode) return undefined;

    const unsubscribe = window.buddy.onClickMode(setClickThrough);
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const toggleVoiceMode = () => {
    const next = voiceMode === "offline" ? "online" : "offline";
    setVoiceMode(next);
    setVoiceStatus(
      next === "offline"
        ? "Switching to offline recognition..."
        : "Switching to online recognition..."
    );
  };

  return (
    <main className="buddy-app">
      <div className="buddy-controls">
        <div className="buddy-title">
          <span className="status-dot" />
          <span>JARWIS</span>
        </div>

        <button
          type="button"
          className="control-button"
          onClick={toggleVoiceMode}
          title="Switch speech recognition mode"
        >
          Voice: {voiceMode === "offline" ? "Offline" : "Online"}
        </button>

        <button
          type="button"
          className={`control-button ${clickThrough ? "active" : ""}`}
          onClick={() => window.buddy?.toggleClickThrough?.()}
          title="Toggle click-through mode (F8)"
        >
          {clickThrough ? "Enable Clicks" : "Click Through"}
        </button>

        <button
          type="button"
          className="control-button close-button"
          onClick={() => window.buddy?.close?.()}
          title="Close Jarwis"
          aria-label="Close Jarwis"
        >
          ×
        </button>
      </div>

      <div className="voice-status" aria-live="polite">
        <span className="voice-indicator" />
        <span>{voiceStatus}</span>
      </div>

      {isWaitingForCommand && (
        <div className="listening-badge">
          <span className="listening-pulse" />
          Listening for command
        </div>
      )}

      {showGreeting && (
        <div className="greeting-bubble">{greeting}</div>
      )}

      <div className="character-container" style={{ left: `${position}px` }}>
        <AnimeBoy
          isWalking={isWalking}
          facing={facing}
          onClick={() => showRandomGreeting()}
        />
      </div>
    </main>
  );
}