import { degtorad } from "./lib.js";

/**
 * Applies patches to core functions to integrate Pathfinder specific measurements.
 */
export class TemplateLayerPF extends TemplateLayer {
  // Use 90 degrees cone in PF1 style
  async _onDragLeftStart(event) {
    if (!game.settings.get("D35E", "measureStyle")) return super._onDragLeftStart(event);

    // Create temporary highlight layer
    if (canvas.grid.getHighlightLayer(this.constructor.HIGHLIGHT_TEMP_LAYERNAME) == null) {
      canvas.grid.addHighlightLayer(this.constructor.HIGHLIGHT_TEMP_LAYERNAME);
    }

    // Create the new preview template
    const tool = game.activeTool;
    const origin = event.data.origin;
    const pos = canvas.grid.getSnappedPosition(origin.x, origin.y, 2);
    origin.x = pos.x;
    origin.y = pos.y;

    // Create the template
    const data = {
      user: game.user.id,
      t: tool,
      x: pos.x,
      y: pos.y,
      distance: 1,
      direction: 0,
      fillColor: game.user.data.color || "#FF0000",
    };
    if (tool === "cone") data["angle"] = 90;
    else if (tool === "ray") data["width"] = 5;

    // Assign the template
    const doc = new CONFIG.MeasuredTemplate.documentClass(data, { parent: canvas.scene });
    const template = new CONFIG.MeasuredTemplate.objectClass(doc);
    event.data.preview = this.preview.addChild(template);
    return template.draw();
  }

  _onDragLeftMove(event) {
    if (!game.settings.get("D35E", "measureStyle")) return super._onDragLeftMove(event);

    const { destination, createState, preview, origin } = event.data;
    if (createState === 0) return;

    // Snap the destination to the grid
    event.data.destination = canvas.grid.getSnappedPosition(destination.x, destination.y, 2);

    // Compute the ray
    const ray = new Ray(origin, destination);
    const dist = canvas.dimensions.distance;
    const ratio = canvas.dimensions.size / dist;

    // Update the preview object
    const type = event.data.preview.data.t;
    // Set direction
    if (["cone", "circle"].includes(type)) {
      preview.data.direction = Math.floor((Math.normalizeDegrees(Math.toDegrees(ray.angle)) + 45 / 2) / 45) * 45;
    } else if (type === "ray") {
      preview.data.direction = Math.floor((Math.normalizeDegrees(Math.toDegrees(ray.angle)) + 5 / 2) / 5) * 5;
    } else {
      preview.data.direction = Math.normalizeDegrees(Math.toDegrees(ray.angle));
    }
    // Set distance
    if (["cone", "circle", "ray"].includes(type)) {
      preview.data.distance = Math.floor(ray.distance / ratio / dist) * dist;
    } else {
      preview.data.distance = ray.distance / ratio;
    }
    preview.refresh();

    // Confirm the creation state
    event.data.createState = 2;
  }
}

export class MeasuredTemplatePF extends MeasuredTemplate {
  getHighlightedSquares() {
    if (!game.settings.get("D35E", "measureStyle") || !["circle", "cone"].includes(this.t)) return [];

    const grid = canvas.grid,
      d = canvas.dimensions;

    if (!this.id || !this.shape) return [];

    // Get number of rows and columns
    const nr = Math.ceil((this.distance * 1.5) / d.distance / (d.size / grid.h)),
      nc = Math.ceil((this.distance * 1.5) / d.distance / (d.size / grid.w));

    // Get the center of the grid position occupied by the template
    const x = this.x,
      y = this.y;

    const [cx, cy] = grid.getCenter(x, y),
      [col0, row0] = grid.grid.getGridPositionFromPixels(cx, cy),
      minAngle = (360 + ((this.direction - this.angle * 0.5) % 360)) % 360,
      maxAngle = (360 + ((this.direction + this.angle * 0.5) % 360)) % 360;

    const within_angle = function (min, max, value) {
      min = (360 + (min % 360)) % 360;
      max = (360 + (max % 360)) % 360;
      value = (360 + (value % 360)) % 360;

      if (min < max) return value >= min && value <= max;
      return value >= min || value <= max;
    };

    const measureDistance = function (p0, p1) {
      const gs = canvas.dimensions.size,
        ray = new Ray(p0, p1),
        // How many squares do we travel across to get there? If 2.3, we should count that as 3 instead of 2; hence, Math.ceil
        nx = Math.ceil(Math.abs(ray.dx / gs)),
        ny = Math.ceil(Math.abs(ray.dy / gs));

      // Get the number of straight and diagonal moves
      const nDiagonal = Math.min(nx, ny),
        nStraight = Math.abs(ny - nx);

      // Diagonals in PF pretty much count as 1.5 times a straight
      const distance = Math.floor(nDiagonal * 1.5 + nStraight);
      const distanceOnGrid = distance * canvas.dimensions.distance;
      return distanceOnGrid;
    };

    const originOffset = { x: 0, y: 0 };
    // Offset measurement for cones
    // Offset is to ensure that cones only start measuring from cell borders, as in https://www.d20pfsrd.com/magic/#Aiming_a_Spell
    if (this.t === "cone") {
      // Degrees anticlockwise from pointing right. In 45-degree increments from 0 to 360
      const dir = (this.direction >= 0 ? 360 - this.direction : -this.direction) % 360;
      // If we're not on a border for X, offset by 0.5 or -0.5 to the border of the cell in the direction we're looking on X axis
      const xOffset =
        this.x % d.size != 0
          ? Math.sign((1 * Math.round(Math.cos(degtorad(dir)) * 100)) / 100) / 2 // /2 turns from 1/0/-1 to 0.5/0/-0.5
          : 0;
      // Same for Y, but cos Y goes down on screens, we invert
      const yOffset =
        this.y % d.size != 0 ? -Math.sign((1 * Math.round(Math.sin(degtorad(dir)) * 100)) / 100) / 2 : 0;
      originOffset.x = xOffset;
      originOffset.y = yOffset;
    }

    const result = [];
    for (let a = -nc; a < nc; a++) {
      for (let b = -nr; b < nr; b++) {
        // Position of cell's top-left corner, in pixels
        const [gx, gy] = canvas.grid.grid.getPixelsFromGridPosition(col0 + a, row0 + b);
        // Position of cell's center, in pixels
        const [cellCenterX, cellCenterY] = [gx + d.size * 0.5, gy + d.size * 0.5];

        // Determine point of origin
        const origin = { x: this.x, y: this.y };
        origin.x += originOffset.x * d.size;
        origin.y += originOffset.y * d.size;

        const ray = new Ray(origin, { x: cellCenterX, y: cellCenterY });

        const rayAngle = (360 + ((ray.angle / (Math.PI / 180)) % 360)) % 360;
        if (this.t === "cone" && ray.distance > 0 && !within_angle(minAngle, maxAngle, rayAngle)) {
          continue;
        }

        // Determine point we're measuring the distance to - always in the center of a grid square
        const destination = { x: cellCenterX, y: cellCenterY };

        const distance = measureDistance(destination, origin);
        if (distance <= this.distance) {
          result.push({ x: gx, y: gy });
        }
      }
    }

    return result;
  }

  getTokensWithin() {
    const highlightSquares = this.getHighlightedSquares(),
      d = canvas.dimensions;

    const inRect = function (point, rect) {
      return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;
    };

    const result = [];
    for (const s of highlightSquares) {
      for (const t of canvas.tokens.placeables) {
        if (result.includes(t)) continue;

        const tokenData = {
          x: Math.round(t.x / d.size),
          y: Math.round(t.y / d.size),
          width: Math.round(t.width / d.size),
          height: Math.round(t.height / d.size),
        };
        const squareData = {
          x: Math.round(s.x / d.size),
          y: Math.round(s.y / d.size),
        };

        if (inRect(squareData, tokenData)) result.push(t);
      }
    }

    return result;
  }

  // Highlight grid in PF1 style
  highlightGrid() {
    if (!game.settings.get("D35E", "measureStyle") || !["circle", "cone"].includes(this.t))
      return super.highlightGrid();

    const grid = canvas.grid,
      bc = this.borderColor,
      fc = this.fillColor;

    // Only highlight for objects which have a defined shape
    if (!this.id || !this.shape) return;

    // Clear existing highlight
    var templateName = "Template";
    if (game.release.generation >= 10) {
      templateName = "MeasuredTemplate";
    }
    const hl = grid.getHighlightLayer(`${templateName}.${this.id}`);
    hl.clear();

    // Get grid squares to highlight
    const highlightSquares = this.getHighlightedSquares();
    for (const s of highlightSquares) {
      grid.grid.highlightGridPosition(hl, { x: s.x, y: s.y, color: fc, border: bc });
    }
  }


}

let newFun = MeasuredTemplatePF.prototype.refresh.toString();
newFun = newFun.replace(
    /this\.template\.beginTextureFill\(\{[\s\S]*\}\)\;/,
    `
			{
				let mat = PIXI.Matrix.IDENTITY;
				// rectangle
				if (this.shape.width && this.shape.height)
					mat.scale(this.shape.width / this.texture.width, this.shape.height / this.texture.height);
				else if (this.shape.radius) {
					mat.scale(this.shape.radius * 2 / this.texture.height, this.shape.radius * 2 / this.texture.width)
					// Circle center is texture start...
					mat.translate(-this.shape.radius, -this.shape.radius);
				} else if (this.t === "ray") {
					const d = canvas.dimensions,
								height = this.width * d.size / d.distance,
								width = this.distance * d.size / d.distance;
					mat.scale(width / this.texture.width, height / this.texture.height);
					mat.translate(0, -height * 0.5);
					mat.rotate(toRadians(this.direction));
				} else {// cone
					const d = canvas.dimensions;
			
					// Extract and prepare data
					let {direction, distance, angle} = this.;
					distance *= (d.size / d.distance);
					direction = toRadians(direction);
					const width = this.distance * d.size / d.distance;
					const angles = [(angle/-2), (angle/2)];
					distance = distance / Math.cos(toRadians(angle/2));
			
					// Get the cone shape as a polygon
					const rays = angles.map(a => Ray.fromAngle(0, 0, direction + toRadians(a), distance+1));
					const height = Math.sqrt((rays[0].B.x - rays[1].B.x) * (rays[0].B.x - rays[1].B.x)
													+ (rays[0].B.y - rays[1].B.y) * (rays[0].B.y - rays[1].B.y));
					mat.scale(width / this.texture.width, height / this.texture.height);
					mat.translate(0, -height/2)
					mat.rotate(toRadians(this.direction));
				}
				this.template.beginTextureFill({
					texture: this.texture,
					matrix: mat,
					alpha: 0.8
				});
				// move into draw or so
				const source = getProperty(this.texture, "baseTexture.resource.source")
				if ( source && (source.tagName === "VIDEO") && game.D35E.createdMeasureTemplates.has(this.id) ) {
					source.loop = false;
					source.muted = true;
					game.video.play(source);
					game.D35E.createdMeasureTemplates.delete(this.id)
				}
		}`
);

MeasuredTemplate.prototype.refresh = Function(
    `"use strict"; return ( function ${newFun} )`
)();
