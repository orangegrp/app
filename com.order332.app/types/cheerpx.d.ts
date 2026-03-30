declare namespace CheerpX {
  interface MountPointConfig {
    // 'devpts' and 'sys' are supported at runtime but absent from the official
    // npm package type declarations — webvm.io uses both.
    type: 'ext2' | 'dir' | 'devs' | 'proc' | 'devpts' | 'sys'
    path: string
    dev?:
      | CloudDevice
      | HttpBytesDevice
      | IDBDevice
      | OverlayDevice
      | WebDevice
      | DataDevice
  }

  interface NetworkInterface {
    authKey?: string
    controlUrl?: string
    loginUrlCb?: (url: string) => void
    stateUpdateCb?: (state: number) => void
    netmapUpdateCb?: (map: unknown) => void
  }

  interface RunOptions {
    env?: string[]
    cwd?: string
    uid?: number
    gid?: number
  }

  class CloudDevice {
    static create(url: string): Promise<CloudDevice>
  }

  class HttpBytesDevice {
    static create(url: string): Promise<HttpBytesDevice>
  }

  class IDBDevice {
    static create(name: string): Promise<IDBDevice>
  }

  class OverlayDevice {
    static create(
      read: CloudDevice | HttpBytesDevice,
      write: IDBDevice
    ): Promise<OverlayDevice>
  }

  class WebDevice {
    static create(path: string): Promise<WebDevice>
  }

  class DataDevice {
    static create(): Promise<DataDevice>
  }

  class Linux {
    static create(options: {
      mounts: MountPointConfig[]
      networkInterface?: NetworkInterface
    }): Promise<Linux>

    setConsole(el: HTMLElement): void
    setCustomConsole(
      writeFunc: (buf: Uint8Array, vt: number) => void,
      cols: number,
      rows: number
    ): (keyCode: number) => void
    // Returns an EventListener (for host-side VT triggering), NOT a completion
    // callback. webvm.io ignores the return value — do not call it inside the
    // activateFunc callback.
    setActivateConsole(activateFunc: (idx: number) => void): EventListener
    setKmsCanvas(canvas: HTMLCanvasElement, width: number, height: number): void
    run(cmd: string, args: string[], opts?: RunOptions): Promise<{ status: number }>
    registerCallback(event: string, cb: (val: string | number) => void): void
    unregisterCallback(event: string, cb: (val: string | number) => void): void
  }
}

interface Window {
  CheerpX: typeof CheerpX
}
