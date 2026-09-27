export class TourController {
  constructor(cameraController, tourStops, onStopChange = null) {
    this.cameraController = cameraController;
    this.stops = tourStops || [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.timer = null;
    this.onStopChange = onStopChange;
  }

  start() {
    this.currentIndex = 0;
    this.isPlaying = true;
    this.playCurrentStop();
  }

  playCurrentStop() {
    if (!this.isPlaying) return;
    if (this.currentIndex >= this.stops.length) {
      this.stop();
      return;
    }

    const currentStop = this.stops[this.currentIndex];
    if (this.onStopChange) {
      this.onStopChange(currentStop, this.currentIndex, this.stops.length);
    }

    // Fly camera to stop
    this.cameraController.flyTo(
      {
        position: currentStop.position,
        target: currentStop.target
      },
      2.0,
      () => {
        // Hold for duration then advance
        if (!this.isPlaying) return;
        const holdTime = (currentStop.duration || 4.0) * 1000;
        this.timer = setTimeout(() => {
          if (this.isPlaying) {
            this.currentIndex++;
            this.playCurrentStop();
          }
        }, holdTime);
      }
    );
  }

  next() {
    if (this.timer) clearTimeout(this.timer);
    if (this.currentIndex < this.stops.length - 1) {
      this.currentIndex++;
      this.playCurrentStop();
    } else {
      this.stop();
    }
  }

  prev() {
    if (this.timer) clearTimeout(this.timer);
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.playCurrentStop();
    }
  }

  togglePause() {
    this.isPlaying = !this.isPlaying;
    if (this.isPlaying) {
      this.playCurrentStop();
    } else if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  stop() {
    this.isPlaying = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.onStopChange) this.onStopChange(null, -1, this.stops.length);
  }
}
