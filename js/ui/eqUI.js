// File: js/ui/eqUI.js
import { audioEffect } from '../core/audioEffect.js';
import { storage } from '../core/storage.js';
import { modalUI } from './modalUI.js';

export class EqUI {
  constructor() {
    this.frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    this.stdPresets = {
      'Flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      'Bass Boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
      'Acoustic': [2, 3, 1, 0, -1, 1, 3, 4, 3, 2],
      'Rock': [5, 4, 3, 1, -1, -1, 2, 3, 4, 5],
      'Vocal': [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1],
      'Electronic': [5, 4, 2, 0, -2, -1, 1, 4, 5, 4]
    };
    this.customPresets = [];
    this.currentBands = [...this.stdPresets['Flat']];
    
    this._initDOM();
    this._bindEvents();
    this.loadPresets();
  }
  
  _initDOM() {
    this.modal = document.getElementById('eq-modal');
    this.openBtn = document.getElementById('eq-btn');
    this.closeBtn = document.getElementById('close-eq-btn');
    this.resetBtn = document.getElementById('reset-eq-btn');
    this.presetSelect = document.getElementById('eq-preset-select');
    this.saveBtn = document.getElementById('eq-save-btn');
    this.deleteBtn = document.getElementById('eq-delete-btn');
    this.fadersContainer = document.getElementById('eq-faders-scroll');
    
    if (!this.presetSelect || !this.fadersContainer) {
      console.warn('[EqUI] EQ Elements not found in DOM.');
      return;
    }
    
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
        this.presetSelect.value = 'Custom...';
      });
    });
  }
  
  _updateBandUI(index, val) {
    if (!this.sliders[index] || !this.valLabels[index]) return;
    const slider = this.sliders[index];
    const label = this.valLabels[index];
    label.textContent = (val > 0 ? '+' : '') + val.toFixed(1) + 'dB';
    this.currentBands[index] = val;
    
    if (val > 0) {
      slider.classList.add('glow');
      label.classList.add('glow-text');
    } else {
      slider.classList.remove('glow');
      label.classList.remove('glow-text');
    }
  }
  
  async loadPresets() {
    if (!this.presetSelect) return;
    this.presetSelect.innerHTML = '';
    
    Object.keys(this.stdPresets).forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      this.presetSelect.appendChild(opt);
    });
    
    try {
      this.customPresets = await storage.getEqPresets();
      this.customPresets.forEach(preset => {
        const opt = document.createElement('option');
        opt.value = preset.id;
        opt.textContent = preset.id;
        this.presetSelect.appendChild(opt);
      });
    } catch (e) {
      console.error('[EqUI]', e);
    }
    
    const customOpt = document.createElement('option');
    customOpt.value = 'Custom...';
    customOpt.textContent = 'Custom...';
    customOpt.hidden = true;
    this.presetSelect.appendChild(customOpt);
  }
  
  applyPreset(presetName) {
    if (!this.presetSelect) return;
    let bands = this.stdPresets[presetName];
    if (!bands) {
      const custom = this.customPresets.find(p => p.id === presetName);
      if (custom) bands = custom.bands;
    }
    if (bands) {
      bands.forEach((val, index) => {
        if (this.sliders[index]) {
          this.sliders[index].value = val;
          this._updateBandUI(index, val);
          audioEffect.setEqBand(index, val);
        }
      });
      this.presetSelect.value = presetName;
    }
  }
  
  _bindEvents() {
    this.openBtn?.addEventListener('click', () => this.modal?.classList.remove('hidden'));
    this.closeBtn?.addEventListener('click', () => this.modal?.classList.add('hidden'));
    this.resetBtn?.addEventListener('click', () => this.applyPreset('Flat'));
    
    this.presetSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val !== 'Custom...') {
        this.applyPreset(val);
      }
    });
    
    this.saveBtn?.addEventListener('click', async () => {
      let name = await modalUI.showPrompt("บันทึก Preset", "ตั้งชื่อ Preset (เว้นว่างเพื่อสุ่มชื่อ):");
      if (name === null) return;
      
      if (name.trim() === '') {
        name = `Custom ${Math.floor(Date.now() / 1000).toString().slice(-4)}`;
      }
      
      if (this.stdPresets[name]) {
        await modalUI.showAlert('แจ้งเตือน', 'ชื่อนี้ซ้ำกับ Preset มาตรฐานค่ะ กรุณาตั้งชื่ออื่นนะคะ');
        return;
      }
      
      try {
        await storage.saveEqPreset({
          id: name,
          bands: [...this.currentBands]
        });
        await this.loadPresets();
        this.presetSelect.value = name;
        modalUI.showToast(`บันทึก ${name} เรียบร้อยค่ะ`);
      } catch (e) {
        await modalUI.showAlert('ผิดพลาด', 'บันทึกไม่สำเร็จค่ะ: ' + e.message);
      }
    });
    
    this.deleteBtn?.addEventListener('click', async () => {
      if (!this.presetSelect) return;
      const currentName = this.presetSelect.value;
      if (this.stdPresets[currentName] || currentName === 'Custom...') {
        await modalUI.showAlert('แจ้งเตือน', 'ไม่สามารถลบ Preset มาตรฐานได้ค่ะ');
        return;
      }
      
      const isConfirmed = await modalUI.showConfirm('ยืนยันการลบ', `ลบ Preset "${currentName}" อย่างถาวร?`);
      if (isConfirmed) {
        try {
          await storage.deleteEqPreset(currentName);
          await this.loadPresets();
          this.applyPreset('Flat');
          modalUI.showToast('ลบ Preset เรียบร้อยค่ะ');
        } catch (e) {
          await modalUI.showAlert('ผิดพลาด', 'ลบไม่สำเร็จค่ะ: ' + e.message);
        }
      }
    });
  }
}
