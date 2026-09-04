// js/core/audioEngine.js
import { audioEffect } from './audioEffect.js';

class AudioEngine {
    constructor() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.context = new AudioContext();
        this.audioElement = new Audio();
        
        this.isEffectInitialized = false;
        this.currentObjectUrl = null;
        
        this.audioElement.onerror = (error) => {
            console.error("เกิดข้อผิดพลาดในการโหลดหรือเล่นไฟล์เสียง:", error);
            audioEffect.stop();
            this.skipToNext();
        };
        
        this.audioElement.onplay = () => {
            audioEffect.start();
        };
        
        this.audioElement.onpause = () => {
            audioEffect.stop();
        };
        
        // ป้องกัน Android WebView สั่ง Suspend AudioContext เมื่อยุบแอพหรือจอดับ
        document.addEventListener('visibilitychange', async () => {
            if (this.context && this.context.state === 'suspended' && !this.audioElement.paused) {
                try {
                    await this.context.resume();
                } catch (e) {
                    console.warn('[AudioEngine] Context resume error on visibility change:', e);
                }
            }
        });
    }
    
    async load(fileOrUrl) {
        try {
            if (typeof fileOrUrl === 'string') {
                this.audioElement.src = fileOrUrl;
            } else if (fileOrUrl instanceof File || fileOrUrl instanceof Blob) {
                if (this.currentObjectUrl) {
                    URL.revokeObjectURL(this.currentObjectUrl);
                }
                this.currentObjectUrl = URL.createObjectURL(fileOrUrl);
                this.audioElement.src = this.currentObjectUrl;
            }
            this.audioElement.load();
        } catch (error) {
            console.error("ไม่สามารถโหลดไฟล์เสียงได้:", error);
            this.skipToNext();
        }
    }
    
    async play() {
        if (this.context.state === 'suspended') {
            await this.context.resume();
        }
        if (!this.isEffectInitialized) {
            audioEffect.init(this.context, this.audioElement);
            this.isEffectInitialized = true;
        }
        
        try {
            await this.audioElement.play();
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("เกิดข้อผิดพลาดในการสั่งเล่นเสียง:", error);
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