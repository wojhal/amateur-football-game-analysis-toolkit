// File System Access API + requestVideoFrameCallback — Chromium-only APIs
// not (fully) covered by lib.dom.

interface OpenFilePickerType {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  id?: string;
  types?: OpenFilePickerType[];
}

interface Window {
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
}

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface VideoFrameCallbackMetadata {
  presentationTime: number;
  expectedDisplayTime: number;
  width: number;
  height: number;
  mediaTime: number;
  presentedFrames: number;
  processingDuration?: number;
}

interface HTMLVideoElement {
  requestVideoFrameCallback(
    callback: (now: number, metadata: VideoFrameCallbackMetadata) => void,
  ): number;
  cancelVideoFrameCallback(handle: number): void;
}
