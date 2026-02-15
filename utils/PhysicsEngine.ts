import Matter from 'matter-js';

export class PhysicsEngine {
  private engine: Matter.Engine;
  private world: Matter.World;
  private bodies: Map<string, Matter.Body>;
  private screenWidth: number;
  private screenHeight: number;

  constructor(width: number, height: number) {
    // Initialize engine with custom gravity and sleeping enabled for performance
    this.engine = Matter.Engine.create({
      enableSleeping: true,
    });
    this.world = this.engine.world;
    this.world.gravity.y = 0.5; // Subtle downward gravity

    // Optimize physics iterations for performance
    this.engine.positionIterations = 4;
    this.engine.velocityIterations = 4;

    // Store screen bounds
    this.screenWidth = width;
    this.screenHeight = height;

    // Create boundary walls (invisible static bodies)
    this.createBoundaries();

    this.bodies = new Map();
  }

  private createBoundaries() {
    const wallThickness = 50;
    const walls = [
      // Top wall
      Matter.Bodies.rectangle(
        this.screenWidth / 2,
        -wallThickness / 2,
        this.screenWidth,
        wallThickness,
        { isStatic: true, label: 'wall-top' }
      ),
      // Bottom wall
      Matter.Bodies.rectangle(
        this.screenWidth / 2,
        this.screenHeight + wallThickness / 2,
        this.screenWidth,
        wallThickness,
        { isStatic: true, label: 'wall-bottom' }
      ),
      // Left wall
      Matter.Bodies.rectangle(
        -wallThickness / 2,
        this.screenHeight / 2,
        wallThickness,
        this.screenHeight,
        { isStatic: true, label: 'wall-left' }
      ),
      // Right wall
      Matter.Bodies.rectangle(
        this.screenWidth + wallThickness / 2,
        this.screenHeight / 2,
        wallThickness,
        this.screenHeight,
        { isStatic: true, label: 'wall-right' }
      ),
    ];

    Matter.World.add(this.world, walls);
  }

  addCard(id: string, x: number, y: number, width: number, height: number): Matter.Body {
    const body = Matter.Bodies.rectangle(x, y, width, height, {
      restitution: 0.85, // Bounciness (0-1, higher = more bouncy)
      friction: 0.01,
      density: 0.001,
      label: `card-${id}`,
      sleepThreshold: 60, // Prevent premature sleeping
    });

    this.bodies.set(id, body);
    Matter.World.add(this.world, body);
    return body;
  }

  removeCard(id: string): void {
    const body = this.bodies.get(id);
    if (body) {
      Matter.World.remove(this.world, body);
      this.bodies.delete(id);
    }
  }

  updateCardPosition(id: string, x: number, y: number): void {
    const body = this.bodies.get(id);
    if (body) {
      // Wake the body to ensure physics continues
      Matter.Sleeping.set(body, false);

      // Clamp position to boundaries
      const clampedX = Math.max(80, Math.min(this.screenWidth - 80, x));
      const clampedY = Math.max(60, Math.min(this.screenHeight - 60, y));

      Matter.Body.setPosition(body, { x: clampedX, y: clampedY });
      Matter.Body.setVelocity(body, { x: 0, y: 0 }); // Reset velocity when dragging
    }
  }

  updateCardRotation(id: string, angle: number): void {
    const body = this.bodies.get(id);
    if (body) {
      // Wake the body to ensure physics continues
      Matter.Sleeping.set(body, false);

      Matter.Body.setAngle(body, angle)
    }
  }

  pausePhysicsUpdates(id: string) {
    const body = this.bodies.get(id);
    if (body) {
      // Wake the body before applying velocity
      Matter.Sleeping.set(body, true);
    }
  }

  applyDragRelease(id: string, velocityX: number, velocityY: number): void {
    const body = this.bodies.get(id);
    if (body) {
      // Wake the body before applying velocity
      Matter.Sleeping.set(body, false);
      Matter.Body.setVelocity(body, { x: velocityX, y: velocityY });

      // Apply angular velocity based on horizontal drag direction
      // Positive velocityX (right) = clockwise, negative (left) = counterclockwise
      const angularVelocity = velocityX * 0.002;
      Matter.Body.setAngularVelocity(body, angularVelocity);
    }
  }

  step(delta: number): void {
    Matter.Engine.update(this.engine, delta);
  }

  getCardPosition(id: string): { x: number; y: number; rotation: number } | null {
    const body = this.bodies.get(id);
    if (body) {
      return {
        x: body.position.x,
        y: body.position.y,
        rotation: body.angle,
      };
    }
    return null;
  }

  getAllCardPositions(): Map<string, { x: number; y: number; rotation: number }> {
    const positions = new Map<string, { x: number; y: number; rotation: number }>();
    this.bodies.forEach((body, id) => {
      positions.set(id, {
        x: body.position.x,
        y: body.position.y,
        rotation: body.angle,
      });
    });
    return positions;
  }

  destroy(): void {
    Matter.Engine.clear(this.engine);
    this.bodies.clear();
  }
}
