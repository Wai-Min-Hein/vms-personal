import { create } from "zustand";

interface LiveState {
  columns: 1 | 2 | 3 | 4;
  cameraIds: string[];
  activeCameraId: string | null;
  setColumns: (columns: 1 | 2 | 3 | 4) => void;
  setCameras: (cameraIds: string[]) => void;
  setActiveCamera: (cameraId: string) => void;
  moveCamera: (from: number, to: number) => void;
}

export const useLiveStore = create<LiveState>((set) => ({
  columns: 2,
  cameraIds: [],
  activeCameraId: null,
  setColumns: (columns) => set({ columns }),
  setCameras: (cameraIds) =>
    set((state) => ({
      cameraIds,
      activeCameraId:
        state.activeCameraId && cameraIds.includes(state.activeCameraId)
          ? state.activeCameraId
          : cameraIds[0] ?? null
    })),
  setActiveCamera: (activeCameraId) => set({ activeCameraId }),
  moveCamera: (from, to) => set((state) => {
    const cameraIds = [...state.cameraIds];
    const [item] = cameraIds.splice(from, 1);
    cameraIds.splice(to, 0, item);
    return { cameraIds };
  })
}));
