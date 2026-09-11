// js/core/audioEngine.js
class AudioEngine {
    constructor() {
        this.audioElement = new Audio();
        this.currentObjectUrl = null;
        this.audioCtx = null;
        this.gainNode = null;
        this.isAudioCtxInit = false;
        
        this.audioElement.onerror = (error) => {
            console.warn("Audio Element Warning:", error);
        };
    }
    
    // เริ่มต้นระบบ GainNode ตัวเดียวเพื่อคุมความนุ่มนวลของสัญญาณเสียง
    _initAudioContext() {
        if (this.isAudioCtxInit) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioCtx({ latencyHint: 'playback' });
            const source = this.audioCtx.createMediaElementSource(this.audioElement);
            this.gainNode = this.audioCtx.createGain();
            source.connect(this.gainNode);
            this.gainNode.connect(this.audioCtx.destination);
            this.isAudioCtxInit = true;
        } catch (e) {
            console.warn("[AudioEngine] Web Audio init fallback:", e);
        }
    }
    
    async play() {
        try {
            this._initAudioContext();
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                await this.audioCtx.resume();
            }
            
            // เริ่มต้นที่ 0 แล้วไล่ระดับเสียงขึ้นใน 35ms (ป้องกันเสียงกึกตอนเริ่มเล่นเพลงจาก YouTube)
            if (this.gainNode && this.audioCtx) {
                const now = this.audioCtx.currentTime;
                this.gainNode.gain.cancelScheduledValues(now);
                this.gainNode.gain.setValueAtTime(0.0001, now);
            }
            
            await this.audioElement.play();
            
            if (this.gainNode && this.audioCtx) {
                const now = this.audioCtx.currentTime;
                this.gainNode.gain.cancelScheduledValues(now);
                this.gainNode.gain.linearRampToValueAtTime(1.0, now + 0.035);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Playback Play Error:", error);
            }
        }
    }
    
    async pause() {
        if (!this.audioElement || this.audioElement.paused) return;
        try {
            // หรี่คลื่นเสียงลงเป็น 0 ใน 35ms ก่อนสั่ง Pause ป้องกันลำโพงดีดตัวกะทันหัน
            if (this.gainNode && this.audioCtx && this.audioCtx.state === 'running') {
                const now = this.audioCtx.currentTime;
                this.gainNode.gain.cancelScheduledValues(now);
                this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
                this.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.035);
                await new Promise(resolve => setTimeout(resolve, 40));
            }
            this.audioElement.pause();
            if (this.gainNode && this.audioCtx) {
                this.gainNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
            }
        } catch (e) {
            this.audioElement.pause();
        }
    }
    
    async load(fileOrUrl) {
        try {
            // หรี่เสียงเพลงเดิมลงก่อนสลับไฟล์
            if (!this.audioElement.paused) {
                await this.pause();
            }
            
            if (typeof fileOrUrl === 'string') {
                this.audioElement.src = fileOrUrl;
            } else if (fileOrUrl instanceof File || fileOrUrl instanceof Blob) {
                const oldUrl = this.currentObjectUrl;
                this.currentObjectUrl = URL.createObjectURL(fileOrUrl);
                this.audioElement.src = this.currentObjectUrl;
                
                if (oldUrl) {
                    setTimeout(() => URL.revokeObjectURL(oldUrl), 4000);
                }
            }
        } catch (error) {
            console.error("Audio Load Error:", error);
        }
    }
    
    seek(seconds) {
        if (seconds >= 0 && seconds <= this.audioElement.duration) {
            this.audioElement.currentTime = seconds;
        }
    }
    
    get currentTime() { return this.audioElement.currentTime; }
    get duration() { return this.audioElement.duration; }
    get paused() { return this.audioElement.paused; }
    set volume(val) {
        if (this.gainNode && this.audioCtx) {
            this.gainNode.gain.setValueAtTime(val, this.audioCtx.currentTime);
        } else {
            this.audioElement.volume = val;
        }
    }
    
    skipToNext() {
        if (typeof window.nextTrackFallback === 'function') {
            window.nextTrackFallback();
        }
    }
}

export const audioEngine = new AudioEngine();