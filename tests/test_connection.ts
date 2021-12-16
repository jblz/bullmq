import { expect } from 'chai';
import * as IORedis from 'ioredis';
import { v4 } from 'uuid';
import { Queue, Job, Worker, QueueBase } from '../src/classes';
import { RedisClient } from '../src/interfaces';
import { removeAllQueueData } from '../src/utils';

describe('connection', () => {
  let queue: Queue;
  let queueName: string;
  const connection = { host: 'localhost' };

  beforeEach(async function () {
    queueName = `test-${v4()}`;
    queue = new Queue(queueName, { connection: { host: 'localhost' } });
  });

  afterEach(async function () {
    await queue.close();
    await removeAllQueueData(new IORedis(), queueName);
  });

  it('should override maxRetriesPerRequest: null and enableReadyCheck: false as redis options', async () => {
    const opts = {
      connection: {
        host: 'localhost',
        maxRetriesPerRequest: 20,
        enableReadyCheck: true,
      },
    };

    function checkOptions(client: RedisClient) {
      expect(
        (<IORedis.RedisOptions>client.options).maxRetriesPerRequest,
      ).to.be.equal(null);
      expect(
        (<IORedis.RedisOptions>client.options).enableReadyCheck,
      ).to.be.equal(false);
    }

    const queue = new QueueBase(queueName, opts);
    checkOptions(await queue.client);
  });

  describe('when reusing connection with enableReadyCheck as true', () => {
    it('throws an error', async () => {
      const connection = new IORedis({
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      });

      expect(() => new QueueBase(queueName, { connection })).to
        .throw(`Using a redis instance with enableReadyCheck or maxRetriesPerRequest is not permitted.
See https://https://github.com/OptimalBits/bull/issues/1873`);
    });
  });

  describe('when reusing connection with maxRetriesPerRequest different than null', () => {
    it('throws an error', async () => {
      const connection = new IORedis({
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
      });

      expect(() => new QueueBase(queueName, { connection })).to
        .throw(`Using a redis instance with enableReadyCheck or maxRetriesPerRequest is not permitted.
See https://https://github.com/OptimalBits/bull/issues/1873`);
    });
  });

  describe('when maxmemory-policy is different than noeviction in Redis', () => {
    it('throws an error', async () => {
      const opts = {
        connection: {
          host: 'localhost',
        },
      };

      const queue = new QueueBase(queueName, opts);
      const client = await queue.client;
      await client.config('SET', 'maxmemory-policy', 'volatile-lru');

      const queue2 = new QueueBase(`${queueName}2`, opts);

      await expect(queue2.client).to.be.eventually.rejectedWith(
        'Eviction policy is volatile-lru. It should be "noeviction"',
      );
      await client.config('SET', 'maxmemory-policy', 'noeviction');
    });
  });

  it('should recover from a connection loss', async () => {
    let processor;

    const processing = new Promise<void>(resolve => {
      processor = async (job: Job) => {
        expect(job.data.foo).to.be.equal('bar');
        resolve();
      };
    });

    const worker = new Worker(queueName, processor, { connection });

    worker.on('error', err => {
      // error event has to be observed or the exception will bubble up
    });

    queue.on('error', (err: Error) => {
      // error event has to be observed or the exception will bubble up
    });

    worker.run();

    const workerClient = await worker.client;
    const queueClient = await queue.client;

    // Simulate disconnect
    (<any>queueClient).stream.end();
    queueClient.emit('error', new Error('ECONNRESET'));

    (<any>workerClient).stream.end();
    workerClient.emit('error', new Error('ECONNRESET'));

    // add something to the queue
    await queue.add('test', { foo: 'bar' });

    await processing;
    await worker.close();
  });

  it('should handle jobs added before and after a redis disconnect', async () => {
    let count = 0;
    let processor;

    const processing = new Promise<void>((resolve, reject) => {
      processor = async (job: Job) => {
        try {
          if (count == 0) {
            expect(job.data.foo).to.be.equal('bar');
          } else {
            resolve();
          }
          count++;
        } catch (err) {
          reject(err);
        }
      };
    });

    const worker = new Worker(queueName, processor, { connection });

    worker.on('error', err => {
      // error event has to be observed or the exception will bubble up
    });

    queue.on('error', (err: Error) => {
      // error event has to be observed or the exception will bubble up
    });

    await worker.waitUntilReady();

    worker.on('completed', async () => {
      if (count === 1) {
        const workerClient = await worker.client;
        const queueClient = await queue.client;

        (<any>queueClient).stream.end();
        queueClient.emit('error', new Error('ECONNRESET'));

        (<any>workerClient).stream.end();
        workerClient.emit('error', new Error('ECONNRESET'));

        await queue.add('test', { foo: 'bar' });
      }
    });

    worker.run();

    await queue.waitUntilReady();
    await queue.add('test', { foo: 'bar' });

    await processing;

    await worker.close();
  });

  /*
  it('should not close external connections', () => {
    const client = new redis();
    const subscriber = new redis();

    const opts = {
      createClient(type) {
        switch (type) {
          case 'client':
            return client;
          case 'subscriber':
            return subscriber;
          default:
            return new redis();
        }
      },
    };

    const testQueue = utils.buildQueue('external connections', opts);

    return testQueue
      .isReady()
      .then(() => {
        return testQueue.add({ foo: 'bar' });
      })
      .then(() => {
        expect(testQueue.client).to.be.eql(client);
        expect(testQueue.eclient).to.be.eql(subscriber);

        return testQueue.close();
      })
      .then(() => {
        expect(client.status).to.be.eql('ready');
        expect(subscriber.status).to.be.eql('ready');
        return Promise.all([client.quit(), subscriber.quit()]);
      });
  });
  */

  it('should fail if redis connection fails', async () => {
    const queueFail = new Queue('connection fail port', {
      connection: { port: 1234, host: '127.0.0.1', retryStrategy: () => null },
    });

    await expect(queueFail.waitUntilReady()).to.be.eventually.rejectedWith(
      'connect ECONNREFUSED 127.0.0.1:1234',
    );
  });

  it('should emit error if redis connection fails', async () => {
    const queueFail = new Queue('connection fail port', {
      connection: { port: 1234, host: '127.0.0.1', retryStrategy: () => null },
    });

    const waitingErrorEvent = new Promise<void>((resolve, reject) => {
      queueFail.on('error', (err: Error) => {
        try {
          expect(err.message).to.equal('connect ECONNREFUSED 127.0.0.1:1234');
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });

    await waitingErrorEvent;
  });

  it('should close if connection has failed', async () => {
    const queueFail = new Queue('connection fail port', {
      connection: { port: 1234, host: '127.0.0.1', retryStrategy: () => null },
    });

    queueFail.on('error', () => {});

    await expect(queueFail.waitUntilReady()).to.be.rejectedWith(
      'connect ECONNREFUSED 127.0.0.1:1234',
    );

    await expect(queueFail.close()).to.be.eventually.equal(undefined);
  });

  it('should close if connection is failing', async () => {
    const queueFail = new Queue('connection fail port', {
      connection: {
        port: 1234,
        host: '127.0.0.1',
        retryStrategy: times => (times === 0 ? 10 : null),
      },
    });

    await expect(queueFail.close()).to.be.eventually.equal(undefined);

    await expect(queueFail.waitUntilReady()).to.be.eventually.rejectedWith(
      'connect ECONNREFUSED 127.0.0.1:1234',
    );
  });
});