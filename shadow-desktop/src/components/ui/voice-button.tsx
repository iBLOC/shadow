import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { telencephalonClient } from '@/lib/telencephalonClient';
import { bytesToBase64, webmToWav16k } from '@/lib/audio';

interface VoiceButtonProps {
  onTranscription: (text: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
}

type RecordingState = 'idle' | 'recording' | 'processing';

/**
 * 语音是**颞叶**的活 —— 端脑的叶区占位记录里，颞叶的声明技能就是
 * `asr / tts`（「听觉处理」）。
 *
 * ⚠️ 这里直说叶区名，**不**递会话 id：端脑**没有**「会话 → 叶区」那张
 * 映射 ⇒ ⇒ 递 `conversation_id` 会被静默丢掉 ⇒ ⇒ 用户配的颞叶语音模型
 * 永远不生效（失败长得像成功）。
 */
const VOICE_LOBE = 'temporal';

export function VoiceButton({ onTranscription, onError, disabled, className }: VoiceButtonProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<RecordingState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100);
      setState('recording');
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start recording';
      onError?.(message);
    }
  }, [onError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.stop();
      setState('processing');
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [state]);

  const processAudio = useCallback(async (audioBlob: Blob) => {
    try {
      // ⚠️ **必须转成 WAV 再送** —— 浏览器录的是 `audio/webm;codecs=opus`，
      // 而大脑 ASR（neuron）**只认 RIFF/WAVE** ⇒ ⇒ 直接送 webm 只会拿到
      // 「audio does not look like WAV」⇒ ⇒ 转换在**录音这一侧**做
      // （WebAudio 解 opus → 降单声道 → 重采样 16 kHz → 16-bit WAV）。
      const wavBytes = await webmToWav16k(audioBlob);
      const base64Audio = bytesToBase64(wavBytes);

      // ⚠️ **走 `telencephalonClient`，不要裸 fetch 相对路径** ——
      // 端脑的路由是 `/api/telencephalon/voice/transcribe`（**不是** `/api/cortex/*`）；
      // 而相对路径 `/api/telencephalon/...` 打的是**前端自己的源**（同源），
      // 不是端脑 ⇒ 在 Tauri 里必然失败。
      // 走 client 还顺带拿到两件事：① 可配置的 `baseUrl` ② `X-Shadow-Key`。
      // （`telencephalonClient.transcribeAudio` 已经封装好了这条路。）
      // ⚠️ **带上叶区** ⇒ 端脑先查颞叶的 asr 覆盖（per-lobe 优先于全局
      // 分档默认）。`VOICE_LOBE` 就是颞叶 —— 语音是它的声明技能。
      const result = await telencephalonClient.transcribeAudio(
        base64Audio,
        'wav',
        'zh',
        undefined,
        VOICE_LOBE,
      );

      if (result.text) {
        onTranscription(result.text);
      } else {
        onError?.(t('voice.noSpeechDetected'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process audio';
      onError?.(message);
    } finally {
      setState('idle');
      setRecordingTime(0);
    }
  }, [onTranscription, onError, t]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleClick = () => {
    if (state === 'recording') {
      stopRecording();
    } else if (state === 'idle') {
      startRecording();
    }
  };

  return (
    <Button
      variant={state === 'recording' ? 'destructive' : 'outline'}
      size="icon"
      onClick={handleClick}
      disabled={disabled || state === 'processing'}
      className={className}
      title={state === 'recording' ? t('voice.stopRecording') : t('voice.startRecording')}
    >
      {state === 'processing' ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : state === 'recording' ? (
        <div className="flex flex-col items-center">
          <MicOff className="h-4 w-4" />
          <span className="text-[10px] mt-0.5">{formatTime(recordingTime)}</span>
        </div>
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  );
}
