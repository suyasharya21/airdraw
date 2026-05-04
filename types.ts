
export enum GestureState {
  IDLE = 'IDLE',
  MARKER = 'MARKER',
  ERASER = 'ERASER',
  SCREENSHOT = 'SCREENSHOT',
  PINCH = 'PINCH'
}

export interface Point {
  x: number;
  y: number;
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface Settings {
  markerColor: string;
  brushSize: number;
  eraserSize: number;
  opacity: number;
  whiteboardBackground: boolean;
}
