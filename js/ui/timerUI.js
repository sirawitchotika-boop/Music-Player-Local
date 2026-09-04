import { storage } from '../core/storage.js';
import { modalUI } from './modalUI.js';
import { audioEngine } from '../core/audioEngine.js';

class TimerUI {
    constructor() {
        this.modal = document.getElementById('timer-modal');
        this.openBtn = document.getElementById('sleep-timer-btn');
        this.closeBtn = document.getElementById('close-timer-btn');
        this.dial = document.getElementById('timer-dial');
        this.dialInner = document.querySelector('.timer-dial-inner');
        this.indicator = document.getElementById('timer-dial-indicator');
        
        this.displayMins = document.getElementById('timer-display-mins');
        this.displayLabel = document.getElementById('timer-display-label');
        
        this.toggleEditBtn = document.getElementById('toggle-edit-mode-btn');
        this.addPresetBtn = document.getElementById('add-timer-preset-btn');
        this.resetBtn = document.getElementById('reset-timer-btn');
        
        this.presetsList = document.getElementById('timer-presets-list');
        this.startBtn = document.getElementById('timer-start-btn');
        this.stopBtn = document.getElementById('timer-stop-btn');
        
        this.minutes = 0;
        this.maxMinutes = 720;
        
        this.timerInterval = null;
        this.targetTimestamp = null;
        this.isActive = false;
        this.isEditMode = false;
        
        this.init();
    }
    
    async init() {
        if (!this.modal) return;
        this.bindEvents();
        await this.loadPresets();
        this.updateUIState();
    }
    
    bindEvents() {
        this.openBtn?.addEventListener('click', () => this.openModal());
        this.closeBtn?.addEventListener('click', () => this.closeModal());
        
        this.dialInner?.addEventListener('click', () => {
            if (this.isActive) {
                modalUI.showToast("[WARN] ระบบกำลังนับถอยหลัง - กด STOP เพื่อแก้ไขเวลา", "warning");
                return;
            }
            this.promptManualTime();
        });
        
        this.startBtn?.addEventListener('click', () => this.startTimer());
        this.stopBtn?.addEventListener('click', () => this.stopTimer());
        this.resetBtn?.addEventListener('click', () => this.resetTimer());
        
        this.addPresetBtn?.addEventListener('click', () => this.createPreset());
        this.toggleEditBtn?.addEventListener('click', () => this.toggleEditMode());
    }
    
    openModal() {
        this.modal.classList.remove('hidden');
        this.updateUIState();
    }
    
    closeModal() {
        this.modal.classList.add('hidden');
        if (this.isEditMode) this.toggleEditMode();
    }
    
    setMinutes(mins) {
        if (this.isActive) return;
        this.minutes = mins;
        
        const displayAngle = (mins * 6) % 360;
        this.indicator.style.transform = `rotate(${displayAngle}deg)`;
        this.displayMins.textContent = this.minutes;
        
        document.querySelectorAll('.preset-group').forEach(c => c.classList.remove('active'));
    }
    
    async promptManualTime() {
        const defaultVal = this.minutes === 0 ? '' : this.minutes.toString();
        const input = await modalUI.showPrompt("[INPUT] กำหนดเวลา", "ระบุระยะเวลา (นาที):", defaultVal, "number");
        
        if (input !== null) {
            const parsed = parseInt(input);
            if (isNaN(parsed) || parsed < 0) {
                modalUI.showToast("[ERROR] ค่าตัวเลขไม่ถูกต้อง", "error");
            } else if (parsed > this.maxMinutes) {
                modalUI.showToast(`[ERROR] เกินขีดจำกัดสูงสุด (${this.maxMinutes} นาที)`, "error");
                this.setMinutes(this.maxMinutes);
            } else {
                this.setMinutes(parsed);
            }
        }
    }
    
    triggerHaptic(pattern = 10) {
        if (navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    }
    
    startTimer() {
        if (this.minutes <= 0) {
            modalUI.showToast("[WARN] ค่าเวลาต้องมากกว่า 0 นาที", "warning");
            return;
        }
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        this.targetTimestamp = Date.now() + (this.minutes * 60 * 1000);
        this.isActive = true;
        
        if (this.isEditMode) this.toggleEditMode();
        
        this.updateUIState();
        this.timerInterval = setInterval(() => this.tick(), 1000);
        this.tick();
        modalUI.showToast(`[TIMER] เริ่มระบบนับถอยหลัง (${this.minutes} นาที)`, "success");
    }
    
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.isActive = false;
        this.targetTimestamp = null;
        this.updateUIState();
        modalUI.showToast("[TIMER] ระงับการทำงานตัวจับเวลาแล้ว", "info");
    }

    resetTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.isActive = false;
        this.targetTimestamp = null;
        
        this.setMinutes(0);
        this.updateUIState();
        modalUI.showToast("[TIMER] รีเซ็ตเวลาเป็น 0 นาที", "info");
    }
    
    tick() {
        if (!this.isActive || !this.targetTimestamp) return;
        
        const now = Date.now();
        const diff = this.targetTimestamp - now;
        
        if (diff <= 0) {
            this.executeSleepAction();
            return;
        }
        
        const m = Math.floor((diff / 1000) / 60);
        const s = Math.floor((diff / 1000) % 60);
        
        this.displayMins.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }
    
    executeSleepAction() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (!this.isActive) return;
        
        this.isActive = false;
        this.targetTimestamp = null;
        this.updateUIState();
        this.setMinutes(0);
        
        audioEngine.pause();
        
        this.triggerHaptic([300, 100, 300, 100, 500]);
        modalUI.showToast("[TIMER] ครบกำหนดเวลา - หยุดการทำงาน Audio Engine แล้ว", "info");
        
        this.openBtn.classList.add('breathing');
        setTimeout(() => this.openBtn.classList.remove('breathing'), 5000);
    }
    
    updateUIState() {
        if (this.isActive) {
            this.dial.classList.add('active-breathing');
            this.startBtn.style.opacity = '0.4';
            this.startBtn.disabled = true;
            
            this.stopBtn.style.opacity = '1';
            this.stopBtn.disabled = false;
            
            this.displayMins.classList.add('countdown');
            this.displayLabel.classList.add('countdown');
            this.displayLabel.textContent = 'LEFT';
            
            this.openBtn.classList.add('timer-active-neon');
        } else {
            this.dial.classList.remove('active-breathing');
            this.startBtn.style.opacity = '1';
            this.startBtn.disabled = false;
            
            this.stopBtn.style.opacity = '0.4';
            this.stopBtn.disabled = true;
            
            this.displayMins.classList.remove('countdown');
            this.displayLabel.classList.remove('countdown');
            this.displayLabel.textContent = 'MINUTES';
            this.displayMins.textContent = this.minutes;
            
            this.openBtn.classList.remove('timer-active-neon');
        }
    }
    
    toggleEditMode() {
        const presets = this.presetsList.querySelectorAll('.preset-group');
        if (presets.length === 0 && !this.isEditMode) {
            modalUI.showToast("[WARN] ไม่พบ Preset ในระบบ", "info");
            return;
        }
        this.isEditMode = !this.isEditMode;
        
        if (this.isEditMode) {
            this.presetsList.classList.add('edit-mode');
            this.toggleEditBtn.classList.add('active-edit');
        } else {
            this.presetsList.classList.remove('edit-mode');
            this.toggleEditBtn.classList.remove('active-edit');
        }
        
        this.loadPresets();
    }

    async loadPresets() {
        try {
            const presets = await storage.getTimerPresets();
            if (presets.length === 0 && this.isEditMode) {
                this.isEditMode = false;
                this.presetsList.classList.remove('edit-mode');
                this.toggleEditBtn.classList.remove('active-edit');
            }
            this.renderPresets(presets);
        } catch (e) {
            console.error(e);
        }
    }
    
    renderPresets(presets) {
        this.presetsList.innerHTML = '';
        
        presets.forEach(p => {
            const group = document.createElement('div');
            group.className = 'preset-group';
            if (this.isActive && this.minutes === p.minutes) {
                group.classList.add('active');
            }
            
            const btn = document.createElement('button');
            btn.className = 'preset-chip';
            btn.textContent = p.name;
            btn.addEventListener('click', () => {
                if (this.isEditMode) {
                    modalUI.showToast("[WARN] ระบบอยู่ในโหมดแก้ไข", "warning");
                    return;
                }
                if (this.isActive) {
                    modalUI.showToast("[WARN] กำลังนับถอยหลัง - กด STOP เพื่อเปลี่ยน Preset", "warning");
                    return;
                }
                this.setMinutes(p.minutes);
                document.querySelectorAll('.preset-group').forEach(c => c.classList.remove('active'));
                group.classList.add('active');
            });
            
            const editBtn = document.createElement('button');
            editBtn.className = 'preset-action edit';
            editBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
            editBtn.addEventListener('click', () => this.editPreset(p.id, p.name, p.minutes, presets));
            
            const delBtn = document.createElement('button');
            delBtn.className = 'preset-action delete';
            delBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
            delBtn.addEventListener('click', () => this.managePreset(p.id, p.name));
            
            group.appendChild(btn);
            group.appendChild(editBtn);
            group.appendChild(delBtn);
            this.presetsList.appendChild(group);
        });

        if (this.isEditMode && presets.length > 0) {
            const clearAllBtn = document.createElement('button');
            clearAllBtn.className = 'preset-chip-danger';
            clearAllBtn.innerHTML = 'CLEAR ALL <svg viewBox="0 0 24 24" width="16" height="16" fill="#ff2a2a" style="margin-left:4px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
            clearAllBtn.addEventListener('click', () => this.clearAllPresets());
            this.presetsList.appendChild(clearAllBtn);
        }
    }
    
    async createPreset() {
        if (this.minutes <= 0) {
            modalUI.showToast("[WARN] ค่าเวลาต้องมากกว่า 0 นาที", "warning");
            return;
        }
        
        const name = await modalUI.showPrompt("[INPUT] บันทึก Preset", "ระบุชื่อ Preset:", `${this.minutes} MIN`);
        if (name === null) return;
        
        const cleanName = name.trim();
        if (cleanName === '') {
            modalUI.showToast("[ERROR] ชื่อ Preset ห้ามว่าง", "error");
            return;
        }
        
        const presets = await storage.getTimerPresets();
        const isDuplicate = presets.some(p => p.name.toLowerCase() === cleanName.toLowerCase());
        if (isDuplicate) {
            modalUI.showToast("[ERROR] ตรวจพบชื่อ Preset ซ้ำในระบบ", "error");
            return;
        }
        
        const newPreset = {
            id: `tp_${Date.now()}`,
            name: cleanName,
            minutes: this.minutes
        };
        await storage.saveTimerPreset(newPreset);
        modalUI.showToast("[STATUS] จัดเก็บ Preset สำเร็จ", "success");
        
        this.loadPresets();
    }
    
    async editPreset(id, currentName, currentMinutes, allPresets) {
        const result = await modalUI.showDoublePrompt(
            "[INPUT] แก้ไข Preset", 
            "ชื่อ Preset", currentName,
            "เวลา (นาที)", currentMinutes.toString()
        );
        
        if (result === null) return;
        
        const cleanName = result.val1.trim();
        if (cleanName === '') {
            modalUI.showToast("[ERROR] ชื่อ Preset ห้ามว่าง", "error");
            return;
        }
        
        const isDuplicate = allPresets.some(p => p.id !== id && p.name.toLowerCase() === cleanName.toLowerCase());
        if (isDuplicate) {
            modalUI.showToast("[ERROR] ตรวจพบชื่อ Preset ซ้ำในระบบ", "error");
            return;
        }
        
        const parsed = parseInt(result.val2);
        if (isNaN(parsed) || parsed <= 0) {
            modalUI.showToast("[ERROR] ค่าเวลาต้องเป็นตัวเลขที่มากกว่า 0", "error");
            return;
        } else if (parsed > this.maxMinutes) {
            modalUI.showToast(`[ERROR] เกินขีดจำกัดสูงสุด (${this.maxMinutes} นาที)`, "error");
            return;
        }
        
        await storage.saveTimerPreset({ id, name: cleanName, minutes: parsed });
        modalUI.showToast("[STATUS] อัปเดตข้อมูล Preset สำเร็จ", "success");
        this.loadPresets();
    }
    
    async managePreset(id, name) {
        const confirmDelete = await modalUI.showConfirm("[CONFIRM] ลบ Preset", `ยืนยันการลบ Preset "${name}"?`);
        if (confirmDelete) {
            await storage.deleteTimerPreset(id);
            modalUI.showToast("[STATUS] ลบ Preset สำเร็จ", "info");
            this.loadPresets();
        }
    }
    
    async clearAllPresets() {
        const confirm1 = await modalUI.showConfirm("[CONFIRM] ล้างข้อมูล", "ยืนยันการลบ Preset ทั้งหมดหรือไม่?");
        if (confirm1) {
            const confirm2 = await modalUI.showConfirm("[WARNING] ยืนยันขั้นสุดท้าย", "ข้อมูล Preset ทั้งหมดจะถูกลบถาวร ดำเนินการต่อ?");
            if (confirm2) {
                await storage.clearTimerPresets();
                modalUI.showToast("[STATUS] ล้างข้อมูล Preset ทั้งหมดแล้ว", "success");
                this.loadPresets();
            }
        }
    }
}

export const timerUI = new TimerUI();