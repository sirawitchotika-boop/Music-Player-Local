// js/core/audioEngine.js
class AudioEngine {
    constructor() {
        this.audioElement = new Audio();
        this.currentObjectUrl = null;
        
        this.audioElement.onerror = (error) => {
            console.error("Audio Error:", error);
            this.skipToNext();
        };
    }
    
    // ฟังก์ชันลดเสียงลง 0 อย่างนุ่มนวลใน 30ms ป้องกันแรงกระชากของคลื่นเสียง (Zero-Crossing Pop)
    async microFadeOut(durationMs = 30) {
        if (!this.audioElement || this.audioElement.paused || this.audioElement.currentTime === 0) return;
        try {
            const originalVol = this.audioElement.volume;
            const steps = 4;
            const stepTime = durationMs / steps;
            for (let i = steps - 1; i >= 0; i--) {
                this.audioElement.volume = Math.max(0, (i / steps) * originalVol);
                await new Promise(res => setTimeout(res, stepTime));
            }
            this.audioElement.pause();
            this.audioElement.volume = originalVol;
        } catch (e) {
            this.audioElement.pause();
        }
    }
    
    async load(fileOrUrl) {
        try {
            // ดัก Fade out สั้นๆ ให้คลื่นเสียงแตะ 0 ก่อนตัดไฟล์
            if (!this.audioElement.paused && this.audioElement.currentTime > 0) {
                await this.microFadeOut(30);
            }
            
            if (typeof fileOrUrl === 'string') {
                this.audioElement.src = fileOrUrl;
            } else if (fileOrUrl instanceof File || fileOrUrl instanceof Blob) {
                const oldUrl = this.currentObjectUrl;
                this.currentObjectUrl = URL.createObjectURL(fileOrUrl);
                this.audioElement.src = this.currentObjectUrl;
                
                // หน่วงเวลาคืน Memory 4 วินาที ไม่ตัดสตรีมเสียงกะทันหัน
                if (oldUrl) {
                    setTimeout(() => URL.revokeObjectURL(oldUrl), 4000);
                }
            }
        } catch (error) {
            console.error("Audio Load Error:", error);
            this.skipToNext();
        }
    }
    
    async play() {
        try {
            await this.audioElement.play();
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Playback Play Error:", error);
            }
        }
    }
    
    pause() {
        this.audioElement.pause();
    }
    
    seek(seconds) {
        if (seconds >= 0 && seconds <= this.audioElement.duration) {
            this.audioElement.currentTime = seconds;
        }
    }
    
    get currentTime() { return this.audioElement.currentTime; }
    get duration() { return this.audioElement.duration; }
    get paused() { return this.audioElement.paused; }
    set volume(val) { this.audioElement.volume = val; }
    
    skipToNext() {
        if (typeof window.nextTrackFallback === 'function') {
            window.nextTrackFallback();
        }
    }
}

export const audioEngine = new AudioEngine();