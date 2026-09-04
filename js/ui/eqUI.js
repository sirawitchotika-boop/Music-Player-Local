import { audioEffect } from '../core/audioEffect.js';
import { storage } from '../core/storage.js';
import { modalUI } from './modalUI.js';

export class EqUI {
  constructor() {
    this.frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    this.stdPresets = {
      'Flat (Reference)': { bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0 },
      'Harman Target': { bands: [5.5, 4.0, 1.5, -0.5, 0, 1.0, 2.5, 1.5, -1.0, 1.0], preamp: -5.5 },
      'Audiophile Warmth': { bands: [2.5, 3.0, 2.0, 1.0, 0.5, 0, -0.5, -1.5, -2.5, -3.0], preamp: -3.0 },
      'Vocal Clarity': { bands: [-1.5, -1.0, 0, 1.5, 3.0, 3.5, 2.5, 1.0, 0, 0.5], preamp: -3.5 },
      'Air & Soundstage': { bands: [2.0, 1.0, -0.5, -1.0, 0, 1.0, 2.0, 3.0, 4.5, 5.0], preamp: -5.0 },
      'Deep Fidelity Bass': { bands: [6.0, 4.5, 2.0, 0, -1.0, 0, 0, 1.0, 1.5, 1.0], preamp: -6.0 },
      'Fletcher-Munson': { bands: [4.5, 3.0, 1.0, -0.5, -1.0, -0.5, 1.0, 2.0, 3.5, 4.0], preamp: -4.5 }
    };
    this.customPresets = [];
    this.currentBands = [...this.stdPresets['Flat (Reference)'].bands];
    this.currentPreamp = 0;
    this.currentPresetName = 'Flat (Reference)';
    this.isBypassed = false;
    
    this._initDOM();
    this._bindEvents();
    this.loadPresets();
  }
  
  _initDOM() {
    this.modal = document.getElementById('eq-modal');
    this.openBtn = document.getElementById('eq-btn');
    this.closeBtn = document.getElementById('close-eq-btn');
    this.resetBtn = document.getElementById('reset-eq-btn');
    this.bypassBtn = document.getElementById('eq-bypass-btn');
    
    this.presetToggle = document.getElementById('eq-preset-toggle');
    this.presetNameDisplay = document.getElementById('eq-preset-name');
    this.presetMenu = document.getElementById('eq-dropdown-menu');
    
    this.saveBtn = document.getElementById('eq-save-btn');
    this.deleteBtn = document.getElementById('eq-delete-btn');
    this.fadersContainer = document.getElementById('eq-faders-scroll');
    this.preampSlider = document.getElementById('eq-preamp-slider');
    this.preampVal = document.getElementById('eq-preamp-val');
    
    if (!this.fadersContainer) return;
    
    this.sliders = [];
    this.valLabels = [];
    
    this.fadersContainer.innerHTML = '';
    this.frequencies.forEach((freq, index) => {
      const bandDiv = document.createElement('div');
      bandDiv.className = 'eq-band';
      
      const valLabel = document.createElement('div');
      valLabel.className = 'eq-value';
      valLabel.textContent = '0.0dB';
      
      const sliderWrapper = document.createElement('div');
      sliderWrapper.className = 'eq-slider-wrapper';
      
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'eq-slider';
      slider.min = -12;
      slider.max = 12;
      slider.step = 0.1;
      slider.value = 0;
      
      const freqLabel = document.createElement('div');
      freqLabel.className = 'eq-label';
      freqLabel.textContent = freq >= 1000 ? (freq / 1000) + 'k' : freq;
      
      sliderWrapper.appendChild(slider);
      bandDiv.appendChild(valLabel);
      bandDiv.appendChild(sliderWrapper);
      bandDiv.appendChild(freqLabel);
      
      this.fadersContainer.appendChild(bandDiv);
      
      this.sliders.push(slider);
      this.valLabels.push(valLabel);
      
      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this._updateBandUI(index, val);
        audioEffect.setEqBand(index, val);
        this._setPresetDisplay('Custom...');
      });
    });
  }
  
  _setPresetDisplay(name) {
    this.currentPresetName = name;
    if (this.presetNameDisplay) {
      this.presetNameDisplay.textContent = name;
    }
  }
  
  _updateBandUI(index, val) {
    if (!this.sliders[index] || !this.valLabels[index]) return;
    const slider = this.sliders[index];
    const label = this.valLabels[index];
    label.textContent = (val > 0 ? '+' : '') + val.toFixed(1) + 'dB';
    this.currentBands[index] = val;
    
    if (val !== 0) {
      slider.classList.add('glow');
      label.classList.add('glow-text');
    } else {
      slider.classList.remove('glow');
      label.classList.remove('glow-text');
    }
  }
  
  _updatePreampUI(val) {
    if (!this.preampSlider || !this.preampVal) return;
    this.currentPreamp = val;
    this.preampSlider.value = val;
    this.preampVal.textContent = (val > 0 ? '+' : '') + val.toFixed(1) + 'dB';
    
    if (val !== 0) {
      this.preampSlider.classList.add('glow');
      this.preampVal.classList.add('glow-text');
    } else {
      this.preampSlider.classList.remove('glow');
      this.preampVal.classList.remove('glow-text');
    }
  }
  
  async loadPresets() {
    try {
      this.customPresets = await storage.getEqPresets();
    } catch (e) {
      console.error('[EqUI]', e);
    }
    this.renderPresetMenu();
  }
  
  renderPresetMenu() {
    if (!this.presetMenu) return;
    this.presetMenu.innerHTML = '';
    
    const addMenuItem = (name) => {
      const item = document.createElement('div');
      item.className = 'eq-dropdown-item';
      if (name === this.currentPresetName) item.classList.add('active');
      item.textContent = name;
      item.addEventListener('click', () => {
        this.applyPreset(name);
        this.presetMenu.classList.add('hidden');
      });
      this.presetMenu.appendChild(item);
    };
    
    Object.keys(this.stdPresets).forEach(name => addMenuItem(name));
    this.customPresets.forEach(p => addMenuItem(p.id));
  }
  
  applyPreset(presetName) {
    let target = this.stdPresets[presetName];
    if (!target) {
      const custom = this.customPresets.find(p => p.id === presetName);
      if (custom) {
        target = {
          bands: Array.isArray(custom.bands) ? custom.bands : custom,
          preamp: typeof custom.preamp === 'number' ? custom.preamp : 0
        };
      }
    }
    if (target && target.bands) {
      target.bands.forEach((val, index) => {
        if (this.sliders[index]) {
          this.sliders[index].value = val;
          this._updateBandUI(index, val);
          audioEffect.setEqBand(index, val);
        }
      });
      const preampVal = target.preamp !== undefined ? target.preamp : 0;
      this._updatePreampUI(preampVal);
      audioEffect.setPreamp(preampVal);
      this._setPresetDisplay(presetName);
      this.renderPresetMenu();
    }
  }
  
  _bindEvents() {
    this.openBtn?.addEventListener('click', () => this.modal?.classList.remove('hidden'));
    this.closeBtn?.addEventListener('click', () => {
      this.modal?.classList.add('hidden');
      this.presetMenu?.classList.add('hidden');
    });
    this.resetBtn?.addEventListener('click', () => this.applyPreset('Flat (Reference)'));
    
    this.presetToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.presetMenu?.classList.toggle('hidden');
    });
    
    document.addEventListener('click', (e) => {
      if (this.presetMenu && !this.presetMenu.contains(e.target) && e.target !== this.presetToggle) {
        this.presetMenu.classList.add('hidden');
      }
    });
    
    this.preampSlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this._updatePreampUI(val);
      audioEffect.setPreamp(val);
      this._setPresetDisplay('Custom...');
    });
    
    this.bypassBtn?.addEventListener('click', () => {
      this.isBypassed = !this.isBypassed;
      audioEffect.setBypass(this.isBypassed);
      if (this.isBypassed) {
        this.bypassBtn.classList.add('active');
        modalUI.showToast('[AUDIO] Pure Direct: ON (Bypass EQ)', 'info');
      } else {
        this.bypassBtn.classList.remove('active');
        modalUI.showToast('[AUDIO] Pure Direct: OFF (EQ Filter Active)', 'info');
      }
    });
    
    this.saveBtn?.addEventListener('click', async () => {
      let name = await modalUI.showPrompt("[INPUT] บันทึก Preset", "ระบุชื่อ Preset:");
      if (name === null) return;
      
      if (name.trim() === '') {
        name = `Custom_${Math.floor(Date.now() / 1000).toString().slice(-4)}`;
      }
      
      if (this.stdPresets[name]) {
        await modalUI.showAlert('[REJECT] ข้อผิดพลาด', 'ชื่อ Preset นี้สงวนไว้สำหรับระบบ');
        return;
      }
      
      try {
        await storage.saveEqPreset({
          id: name,
          bands: [...this.currentBands],
          preamp: this.currentPreamp
        });
        await this.loadPresets();
        this._setPresetDisplay(name);
        modalUI.showToast(`[STATUS] บันทึก Preset "${name}" สำเร็จ`);
      } catch (e) {
        await modalUI.showAlert('[ERROR] ล้มเหลว', 'เกิดข้อผิดพลาด: ' + e.message);
      }
    });
    
    this.deleteBtn?.addEventListener('click', async () => {
      const currentName = this.currentPresetName;
      if (this.stdPresets[currentName] || currentName === 'Custom...') {
        await modalUI.showAlert('[REJECT] ข้อผิดพลาด', 'ไม่อนุญาตให้ลบ Preset ค่าเริ่มต้นของระบบ');
        return;
      }
      
      const isConfirmed = await modalUI.showConfirm('[CONFIRM] ลบ Preset', `ยืนยันการลบ Preset "${currentName}"?`);
      if (isConfirmed) {
        try {
          await storage.deleteEqPreset(currentName);
          await this.loadPresets();
          this.applyPreset('Flat (Reference)');
          modalUI.showToast('[STATUS] ลบ Preset สำเร็จ');
        } catch (e) {
          await modalUI.showAlert('[ERROR] ล้มเหลว', 'เกิดข้อผิดพลาด: ' + e.message);
        }
      }
    });
  }
}