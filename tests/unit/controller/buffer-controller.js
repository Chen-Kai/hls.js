import assert from 'assert';
import { stub } from 'sinon';
import Hls from '../../../src/hls';
import BufferController from '../../../src/controller/buffer-controller';

describe('BufferController tests', function () {
  let hls;
  let bufferController;
  let flushSpy;
  let removeStub;
  const sandbox = sinon.sandbox.create();

  beforeEach(function () {
    hls = new Hls({});
    bufferController = new BufferController(hls);
    flushSpy = sandbox.spy(bufferController, 'flushLiveBackBuffer');
    removeStub = sandbox.stub(bufferController, 'removeBufferRange');
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('Live back buffer enforcement', function () {
    let mockMedia;
    let mockSourceBuffer;
    let targetDuration;
    let bufStart;

    beforeEach(function () {
      bufStart = 0;
      targetDuration = 5;
      bufferController.media = mockMedia = {
        currentTime: 0
      };
      bufferController.sourceBuffer = mockSourceBuffer = {
        video: {
          buffered: {
            start () {
              return bufStart;
            },
            length: 1
          }
        }
      };
      bufferController._live = true;
      hls.config.liveBackBufferLength = 10;
    });

    it('exits early if not live', function () {
      bufferController.flushLiveBackBuffer();
      assert(removeStub.notCalled);
      assert(!bufferController.flushRange.length);
    });

    it('exits early if liveBackBufferLength is not a finite number, or is less than 0', function () {
      hls.config.liveBackBufferLength = 'foo';
      bufferController.flushLiveBackBuffer();

      hls.config.liveBackBufferLength = -1;
      bufferController.flushLiveBackBuffer();

      assert(removeStub.notCalled);
      assert(!bufferController.flushRange.length);
    });

    it('does not flush if nothing is buffered', function () {
      delete mockSourceBuffer.buffered;
      bufferController.flushLiveBackBuffer();

      mockSourceBuffer = null;
      bufferController.flushLiveBackBuffer();

      assert(removeStub.notCalled);
      assert(!bufferController.flushRange.length);
    });

    it('does not flush if no buffered range intersects with back buffer limit', function () {
      bufStart = 5;
      mockMedia.currentTime = 10;
      bufferController.flushLiveBackBuffer();
      assert(removeStub.notCalled);
      assert(!bufferController.flushRange.length);
    });

    it('does not flush if the liveBackBufferLength is Infinity', function () {
      hls.config.liveBackBufferLength = Infinity;
      mockMedia.currentTime = 15;
      bufferController.flushLiveBackBuffer();
      assert(removeStub.notCalled);
      assert(!bufferController.flushRange.length);
    });

    it('flushes up to the back buffer limit if the buffer intersects with that point', function () {
      mockMedia.currentTime = 15;
      bufferController.flushLiveBackBuffer();
      assert(removeStub.calledOnce);
      assert(bufferController.flushRange.length, 'Should have pushed a flush range');
      assert(!bufferController.flushBufferCounter, 'Should reset the flushBufferCounter');
      assert.deepEqual(bufferController.flushRange[0], {
        start: 0,
        end: 5,
        type: 'video'
      });
    });

    it('flushes to a max of one targetDuration from currentTime, regardless of liveBackBufferLength', function () {
      mockMedia.currentTime = 15;
      hls.config.liveBackBufferLength = 0;
      bufferController.flushLiveBackBuffer();
      assert.deepEqual(bufferController.flushRange[0], {
        start: 0,
        end: 10,
        type: 'video'
      });
    });

    it('should trigger clean back buffer when there are no pending appends', function () {
      bufferController.parent = {};
      bufferController.segments = [{ parent: bufferController.parent }];

      stub(bufferController, 'doAppending');

      bufferController.onSBUpdateEnd();

      assert(flushSpy.notCalled, 'clear live back buffer was called');

      bufferController.segments = [];
      bufferController.onSBUpdateEnd();

      assert(flushSpy.calledOnce, 'clear live back buffer was not called once');
    });
  });
});
