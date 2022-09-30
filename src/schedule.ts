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

function sleep(n: number = 3000) {
  return new Promise((resolve) => {
    setTimeout(resolve, n);
  });
}

async function test() {
  console.log("begin");
  await new Promise((rs, reject) => {
    const sche = new Scheduler(4, rs);
    [5, 3, 7, 6, 8, 1, 2, 4, 9].forEach((n) => {
      sche.add(async () => {
        await sleep(n * 1000);
        console.log(`sleep: ${n}`);
      });
    });
  });
  console.log("end");
}
// test();
