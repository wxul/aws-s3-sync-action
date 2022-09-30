type QueueResolve = (...args: any[]) => void;

export class Scheduler {
  private count: number;
  private waitQueue: QueueResolve[];
  private queueCount: number;
  private cb?: QueueResolve;

  constructor(queueCount = 2, callback?: QueueResolve) {
    this.waitQueue = [];
    this.count = 0;
    this.queueCount = queueCount;
    this.cb = callback;
  }
  async add(promiseCreator: (...args: any) => Promise<any>) {
    if (this.count >= this.queueCount) {
      await new Promise((resolve) => this.waitQueue.push(resolve));
    }
    this.count++;
    const res = await promiseCreator();
    this.count--;
    this.waitQueue.length && this.waitQueue.shift()();
    if (this.count === 0) {
      setTimeout(() => {
        this.cb?.();
      }, 0);
    }
    return res;
  }
}
