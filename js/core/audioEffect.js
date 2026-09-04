export class AudioEffect {
  constructor() {
    this.audioCtx = null;
    this.analyser = null;
    this.source = null;
    this.preampNode = null;
    this.wetGain = null;
    this.dryGain = null;
    this.limiter = null;
    this.canvas = null;
    this.ctx = null;
    this.coreElement = null;
    this.animationId = null;
    this.isPlaying = false;
    this.isBypassed = false;
    
    this.logicalWidth = 280;
    this.logicalHeight = 280;
    
    this.numBars = 28;
    this.barWidth = 5;
    this.barSpacing = 2.5;
    
    this.blockHeight = 4;
    this.blockGap = 2;
    this.maxBlocks = 17;
    
    this.smoothedData = new Float32Array(this.numBars);
    this.ringAngle = 0;
    this.ringRadius = 132;
    
    this.frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    this.filters = [];
    this.currentGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    this.currentPreamp = 0;
    
    this._bindUI();
  }
  
  _bindUI() {
    this.canvas = document.getElementById('visualizer-canvas');
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      this._resizeCanvas();
    }
    this.coreElement = document.getElementById('album-art-core');
  }
  
  _resizeCanvas() {
    if (!this.canvas || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || 280;
    const height = rect.height || 280;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.scale(dpr, dpr);
    this.logicalWidth = width;
    this.logicalHeight = height;
  }
  
  init(existingContext, audioElement) {
    if (!this.analyser) {
      try {
        this.audioCtx = existingContext;
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.78;
        
        this.preampNode = this.audioCtx.createGain();
        this.preampNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
        
        this.wetGain = this.audioCtx.createGain();
        this.dryGain = this.audioCtx.createGain();
        this.wetGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
        this.dryGain.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
        
        this.limiter = this.audioCtx.createDynamicsCompressor();
        this.limiter.threshold.setValueAtTime(-0.1, this.audioCtx.currentTime);
        this.limiter.knee.setValueAtTime(2.0, this.audioCtx.currentTime);
        this.limiter.ratio.setValueAtTime(20.0, this.audioCtx.currentTime);
        this.limiter.attack.setValueAtTime(0.001, this.audioCtx.currentTime);
        this.limiter.release.setValueAtTime(0.1, this.audioCtx.currentTime);
        
        this.filters = [];
        this.frequencies.forEach((freq, index) => {
          const filter = this.audioCtx.createBiquadFilter();
          if (index === 0) {
            filter.type = 'lowshelf';
          } else if (index === this.frequencies.length - 1) {
            filter.type = 'highshelf';
          } else {
            filter.type = 'peaking';
            filter.Q.value = 1.414;
          }
          filter.frequency.value = freq;
          filter.gain.value = this.currentGains[index];
          this.filters.push(filter);
        });
        
        this.source = this.audioCtx.createMediaElementSource(audioElement);
        
        this.source.connect(this.wetGain);
        this.source.connect(this.dryGain);
        
        this.dryGain.connect(this.audioCtx.destination);
        this.dryGain.connect(this.analyser);
        
        this.wetGain.connect(this.preampNode);
        this.preampNode.connect(this.filters[0]);
        for (let i = 0; i < this.filters.length - 1; i++) {
          this.filters[i].connect(this.filters[i + 1]);
        }
        
        const lastFilter = this.filters[this.filters.length - 1];
        lastFilter.connect(this.limiter);
        this.limiter.connect(this.audioCtx.destination);
        lastFilter.connect(this.analyser);
      } catch (error) {
        console.error("[AudioEffect] Init error:", error);
      }
    }
  }
  
  setPreamp(gainDb) {
    this.currentPreamp = gainDb;
    if (this.preampNode && this.audioCtx) {
      const linear = Math.pow(10, gainDb / 20);
      this.preampNode.gain.setTargetAtTime(linear, this.audioCtx.currentTime, 0.03);
    }
  }
  
  setBypass(bypassed) {
    this.isBypassed = bypassed;
    if (this.wetGain && this.dryGain && this.audioCtx) {
      const t = this.audioCtx.currentTime;
      if (bypassed) {
        this.wetGain.gain.setTargetAtTime(0, t, 0.02);
        this.dryGain.gain.setTargetAtTime(1, t, 0.02);
      } else {
        this.wetGain.gain.setTargetAtTime(1, t, 0.02);
        this.dryGain.gain.setTargetAtTime(0, t, 0.02);
      }
    }
  }
  
  setEqBand(index, gainValue) {
    this.currentGains[index] = gainValue;
    if (this.filters && this.filters[index] && this.audioCtx) {
      const filter = this.filters[index];
      filter.gain.setTargetAtTime(gainValue, this.audioCtx.currentTime, 0.03);
    }
  }
  
  start() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    if (!this.isPlaying) {
      this.isPlaying = true;
      this._resizeCanvas();
      this.draw();
    }
  }
  
  stop() {
    this.isPlaying = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);
    }
    if (this.coreElement) {
      this.coreElement.style.transform = 'scale(1)';
    }
  }
  
  draw() {
    if (!this.isPlaying || !this.ctx || !this.analyser) return;
    this.animationId = requestAnimationFrame(() => this.draw());
    
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);
    
    this.ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);
    
    const cx = this.logicalWidth / 2;
    const cy = this.logicalHeight / 2;
    let bassSum = 0;
    for (let i = 0; i < 5; i++) { bassSum += dataArray[i]; }
    const bassAvg = bassSum / 5;
    
    this.ringAngle += 0.015 + (bassAvg / 255) * 0.08;
    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(this.ringAngle);
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    
    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.ringRadius, 0, Math.PI / 3);
    this.ctx.strokeStyle = '#ff1144';
    this.ctx.shadowBlur = 12;
    this.ctx.shadowColor = '#ff1144';
    this.ctx.stroke();
    
    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.ringRadius, Math.PI, Math.PI + Math.PI / 3);
    this.ctx.strokeStyle = '#00e5ff';
    this.ctx.shadowBlur = 12;
    this.ctx.shadowColor = '#00e5ff';
    this.ctx.stroke();
    
    this.ctx.restore();
    
    for (let i = 0; i < this.numBars; i++) {
      const freqIndex = Math.floor(Math.pow(i / this.numBars, 1.5) * (bufferLength * 0.7));
      const val = dataArray[freqIndex] || 0;
      this.smoothedData[i] = this.smoothedData[i] * 0.4 + val * 0.6;
    }
    
    const totalWidth = (this.numBars * (this.barWidth + this.barSpacing)) - this.barSpacing;
    const startX = cx - (totalWidth / 2) + (this.barWidth / 2);
    const baseY = cy + 50;
    const stepHeight = this.blockHeight + this.blockGap;
    const neonColors = ['#ff1144', '#39ff14', '#00e5ff', '#ffea00'];
    const barsPerColor = this.numBars / neonColors.length;
    
    this.ctx.lineWidth = this.barWidth;
    this.ctx.lineCap = 'butt';
    this.ctx.setLineDash([this.blockHeight, this.blockGap]);
    
    this.ctx.globalAlpha = 0.12;
    this.ctx.shadowBlur = 0;
    for (let c = 0; c < neonColors.length; c++) {
      this.ctx.strokeStyle = neonColors[c];
      this.ctx.beginPath();
      for (let b = 0; b < barsPerColor; b++) {
        const i = (c * barsPerColor) + b;
        const x = startX + (i * (this.barWidth + this.barSpacing));
        const fullHeight = this.maxBlocks * stepHeight;
        this.ctx.moveTo(x, baseY);
        this.ctx.lineTo(x, baseY - fullHeight);
      }
      this.ctx.stroke();
    }
    
    this.ctx.globalAlpha = 1.0;
    for (let c = 0; c < neonColors.length; c++) {
      this.ctx.strokeStyle = neonColors[c];
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = neonColors[c];
      this.ctx.beginPath();
      for (let b = 0; b < barsPerColor; b++) {
        const i = (c * barsPerColor) + b;
        const x = startX + (i * (this.barWidth + this.barSpacing));
        const valPercent = this.smoothedData[i] / 255;
        let activeBlocks = Math.ceil(valPercent * this.maxBlocks);
        if (activeBlocks < 1) activeBlocks = 1;
        const activeHeight = activeBlocks * stepHeight;
        this.ctx.moveTo(x, baseY);
        this.ctx.lineTo(x, baseY - activeHeight);
      }
      this.ctx.stroke();
    }
    
    this.ctx.setLineDash([]);
    this.ctx.shadowBlur = 0;
    
    if (this.coreElement) {
      if (bassAvg > 165) {
        const scale = 1 + (Math.max(0, bassAvg - 165) / 255) * 0.15;
        this.coreElement.style.transform = `scale(${scale})`;
      } else {
        this.coreElement.style.transform = 'scale(1)';
      }
    }
  }
}

export const audioEffect = new AudioEffect();