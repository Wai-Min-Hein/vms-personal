import { create } from "zustand";

interface LiveState {
  columns: 1 | 2 | 3 | 4;
  cameraIds: string[];
  setColumns: (columns: 1 | 2 | 3 | 4) => void;
  setCameras: (cameraIds: string[]) => void;
  moveCamera: (from: number, to: number) => void;
}

export const useLiveStore = create<LiveState>((set) => ({
  columns: 2,
  cameraIds: [],
  setColumns: (columns) => set({ columns }),
  setCameras: (cameraIds) => set({ cameraIds }),
  moveCamera: (from, to) => set((state) => {
    const cameraIds = [...state.cameraIds];
    const [item] = cameraIds.splice(from, 1);
    cameraIds.splice(to, 0, item);
    return { cameraIds };
  })
}));
