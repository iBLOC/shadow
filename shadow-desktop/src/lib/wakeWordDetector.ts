const WAKE_WORDS = ['hey shadow', 'hey, shadow', 'heyshadow', '你好影', '你好 影', '您好影'];

export type WakeWordEvent = {
  word: string;
  timestamp: number;
};

type Listener = (event: WakeWordEvent) => void;

interface SpeechRecognitionType extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export class WakeWordDetector {
  private recognition: SpeechRecognitionType | null = null;
  private isRunning = false;
  private listeners: Set<Listener> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.setupRecognition();
      }
    }
  }

  private setupRecognition() {
    if (!this.recognition) return;

    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript.toLowerCase().trim();
          this.checkWakeWords(transcript);
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error('Wake word detection error:', event.error);
      }
    };

    this.recognition.onend = () => {
      if (this.isRunning) {
        this.recognition?.start();
      }
    };
  }

  private checkWakeWords(text: string) {
    const normalized = text.replace(/[.,!?;:'"]/g, '').toLowerCase();
    
    for (const word of WAKE_WORDS) {
      if (normalized.includes(word)) {
        this.emit({ word, timestamp: Date.now() });
        break;
      }
    }
  }

  private emit(event: WakeWordEvent) {
    this.listeners.forEach(listener => listener(event));
  }

  get available(): boolean {
    return this.recognition !== null;
  }

  start(): boolean {
    if (!this.recognition || this.isRunning) return false;
    
    try {
      this.recognition.start();
      this.isRunning = true;
      return true;
    } catch {
      return false;
    }
  }

  stop() {
    if (this.recognition && this.isRunning) {
      this.isRunning = false;
      this.recognition.stop();
    }
  }

  onWakeWord(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
