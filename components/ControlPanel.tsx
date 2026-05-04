
import React, { useState } from 'react';
import { Settings, GestureState } from '../types';
import { 
  Settings as SettingsIcon, 
  Undo2, 
  Redo2, 
  Trash2, 
  X, 
  MousePointer2, 
  Pen, 
  Highlighter, 
  Eraser 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ControlPanelProps {
  settings: Settings;
  setSettings: React.SetStateAction<Settings> | any;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  currentGesture: GestureState;
  fps: number;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
  settings, 
  setSettings, 
  onClear, 
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  currentGesture,
  fps
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleChange = (key: keyof Settings, value: any) => {
    setSettings((prev: Settings) => ({ ...prev, [key]: value }));
  };

  const getGestureInfo = (state: GestureState) => {
    switch (state) {
      case GestureState.MARKER: 
        return { color: 'text-blue-600', icon: <Pen className="w-4 h-4" />, label: 'Drawing' };
      case GestureState.ERASER: 
        return { color: 'text-red-600', icon: <Eraser className="w-4 h-4" />, label: 'Eraser' };
      default: 
        return { color: 'text-gray-500', icon: <MousePointer2 className="w-4 h-4" />, label: 'Hovering' };
    }
  };

  const gestureInfo = getGestureInfo(currentGesture);

  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col items-end gap-3 select-none">
      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-12 h-12 flex items-center justify-center glass-morphism rounded-full shadow-lg border border-white/40 transition-all"
        aria-label="Toggle Settings"
      >
        {isOpen ? <X className="h-6 w-6 text-gray-800" /> : <SettingsIcon className="h-6 w-6 text-gray-800" />}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            className="w-72 glass-morphism rounded-2xl p-6 shadow-2xl flex flex-col gap-6"
          >
            <div className="flex justify-between items-center border-b border-black/10 pb-3">
              <h2 className="text-lg font-bold text-gray-800">Settings</h2>
              <span className="text-[10px] font-mono text-gray-500 bg-white/50 px-1.5 py-0.5 rounded">{fps} FPS</span>
            </div>

            <div className="space-y-4">
              <div className="bg-white/40 p-3 rounded-xl border border-white/50 flex items-center gap-3">
                <div className={`${gestureInfo.color} p-2 bg-white/50 rounded-lg`}>
                  {gestureInfo.icon}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Active Mode</p>
                  <p className={`text-md font-bold ${gestureInfo.color}`}>
                    {gestureInfo.label}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">Brush Color</label>
                  <input 
                    type="color" 
                    value={settings.markerColor}
                    onChange={(e) => handleChange('markerColor', e.target.value)}
                    className="w-full h-8 rounded-md cursor-pointer bg-white/50 p-0.5 border border-white/80"
                  />
                </div>
              </div>

                <div className="flex justify-between items-center bg-white/40 p-2 rounded-xl border border-white/60">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Whiteboard Mode</label>
                  <button 
                    onClick={() => handleChange('whiteboardBackground', !settings.whiteboardBackground)}
                    className={`w-10 h-5 rounded-full relative transition-colors duration-200 ${settings.whiteboardBackground ? 'bg-blue-600' : 'bg-gray-300'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-200 ${settings.whiteboardBackground ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <label className="text-xs font-semibold text-gray-600">Brush Opacity</label>
                    <span className="text-xs text-gray-500 font-mono">{Math.round(settings.opacity * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="1.0" 
                    step="0.05"
                    value={settings.opacity}
                    onChange={(e) => handleChange('opacity', parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between">
                  <label className="text-xs font-semibold text-gray-600">Brush Size</label>
                  <span className="text-xs text-gray-500">{settings.brushSize}px</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="50" 
                  value={settings.brushSize}
                  onChange={(e) => handleChange('brushSize', parseInt(e.target.value))}
                  className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-400"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between">
                  <label className="text-xs font-semibold text-gray-600">Eraser Scale</label>
                  <span className="text-xs text-gray-500">{settings.eraserSize}px</span>
                </div>
                <input 
                  type="range" 
                  min="20" 
                  max="100" 
                  value={settings.eraserSize}
                  onChange={(e) => handleChange('eraserSize', parseInt(e.target.value))}
                  className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <motion.button 
                whileTap={{ scale: 0.95 }}
                onClick={onUndo}
                disabled={!canUndo}
                className={`flex-1 py-2 px-2 rounded-xl border flex items-center justify-center transition-all ${canUndo ? 'bg-white/80 hover:bg-white text-gray-700 border-gray-200 shadow-sm' : 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed'}`}
                title="Undo"
              >
                <Undo2 className="h-5 w-5" />
              </motion.button>
              <motion.button 
                whileTap={{ scale: 0.95 }}
                onClick={onRedo}
                disabled={!canRedo}
                className={`flex-1 py-2 px-2 rounded-xl border flex items-center justify-center transition-all ${canRedo ? 'bg-white/80 hover:bg-white text-gray-700 border-gray-200 shadow-sm' : 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed'}`}
                title="Redo"
              >
                <Redo2 className="h-5 w-5" />
              </motion.button>
              <motion.button 
                whileTap={{ scale: 0.95 }}
                onClick={() => { onClear(); setIsOpen(false); }}
                className="flex-[2] py-2.5 px-4 bg-red-50/50 hover:bg-red-100/80 text-red-600 text-sm font-bold rounded-xl border border-red-200/50 transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </motion.button>
            </div>

            <div className="text-[10px] text-gray-400 text-center space-y-1 pt-2 border-t border-black/5">
              <p>👆 1 Finger: Drawing • 🖐 Open Palm: Eraser</p>
              <p>🤏 Pinch: Drag • 🖼️ Frames: Screenshot</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ControlPanel;
