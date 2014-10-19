/* This is subject to complete rewrite */
Leanorama.extensions.push(function() {
    R = 512;

    // Access to browser-specific styles
    var style = Leanorama.style;

    var corners = {
        nav: {
            right: 18,
            bottom: 18,
            top: -18,
            left: -18
        }
    };

    // Array of all hotspots
    this.hotspots = [];

    initTooltip = (function(hotspot) {
        hotspot._tooltipAnchor = document.createElement('div');
        hotspot._tooltipAnchor.classList.add('leanorama-hotspot-tooltip-anchor');
        hotspot._tooltip = document.createElement('div');
        hotspot._tooltip.classList.add('leanorama-hotspot-tooltip');
        hotspot._tooltip.innerHTML = hotspot.meta.text;
        hotspot._tooltipAnchor.appendChild(hotspot._tooltip);
        this._leanorama.appendChild(hotspot._tooltipAnchor);
        hotspot._polygon.addEventListener('mouseover', (function(e) {
            if (hotspot.tooltip) return;
            var rect = hotspot._hotspot.getBoundingClientRect();
            hotspot._tooltipAnchor.style.top = rect.top + rect.height / 2;
            hotspot._tooltipAnchor.style.left = rect.left + rect.width / 2;
            if (!hotspot._tooltipAnchor.classList.contains('visible'))
                hotspot._tooltipAnchor.classList.add('visible');
            hotspot.tooltip = true;
        }).bind(this));
        hotspot._polygon.addEventListener('mouseout', (function(e) {
            hotspot.tooltip = false;
            if (!hotspot.tooltip) hotspot._tooltipAnchor.classList.remove('visible');
        }).bind(this));
    }).bind(this);

    var bindings = {
        nav: (function(hotspot) {

            // Create polygon on the screen that should cover the hotspot
            hotspot._polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');

            // Create four corners around the hotspot that would serve as the points for the polygon
            var points = '';
            hotspot._corners = [];
            [['top', 'left'], ['top', 'right'], ['bottom', 'right'], ['bottom', 'left']].forEach(function(coords) {

                // Create the corner element
                var corner = document.createElement('div');
                corner.classList.add('leanorama-hotspot-corner');
                hotspot._anchor.appendChild(corner);

                // Position the corner relative to the anchor
                var rect = corner.getBoundingClientRect();
                corner.style.top = corners.nav[coords[0]];
                corner.style.left = corners.nav[coords[1]];

                // Remember the point for the SVG screen, add corner to hotspot object
                points += rect.left + ',' + rect.top + ' ';
                hotspot._corners.push(corner);
            });

            // Position the polygon, and add its class
            hotspot._polygon.setAttribute('points', points);
            hotspot._polygon.classList.add('leanorama-hotspot-onscreen');
            this._screen.appendChild(hotspot._polygon);
            
            // When polygon is clicked, perform scene transition
            hotspot._polygon.addEventListener('click', (function(e) {
                this.rotate(hotspot.meta.pitch, hotspot.meta.yaw, 1000);
                hotspot._tooltipAnchor.classList.remove('visible');
                window.setTimeout(this.init.bind(this, hotspot.meta.target), 1000);
            }).bind(this));

            // Initialize tooltip if necessary
            if (hotspot.meta.text) initTooltip(hotspot);
        }).bind(this)
    };

    // Initialize all hotspots
    for (var ix in this.scene.hotspots) {

        // Get the hotspot metadata from the options
        var hsMeta = this.scene.hotspots[ix];
        hsMeta.yaw = new Leanorama.Angle(hsMeta.yaw);
        hsMeta.pitch = new Leanorama.Angle(hsMeta.pitch);
        
        // The hotspot object...
        // Proper hotspots require a shitload of scaffolding. We're basically recreating a mini-Leanorama for each
        // hotspot. This helps to overcome many flickering and rendering bugs in webkit and firefox.
        var hotspot = {
            meta: hsMeta,
            type: hsMeta.type || 'nav',
            _stage: document.createElement('div'),
            _cube: document.createElement('div'),
            _anchor: document.createElement('div'),
            _hotspot: document.createElement('div'),
            _container: document.createElement('div')
        };

        // Setting classes and building DOM element
        hotspot._container.classList.add('leanorama-container');
        hotspot._stage.classList.add('leanorama-stage');
        hotspot._cube.classList.add('leanorama-cube');
        hotspot._anchor.classList.add('leanorama-hotspot-anchor');
        hotspot._hotspot.classList.add('leanorama-hotspot-' + hotspot.type);
        hotspot._anchor.appendChild(hotspot._hotspot);
        hotspot._cube.appendChild(hotspot._anchor);
        hotspot._stage.appendChild(hotspot._cube);
        hotspot._container.appendChild(hotspot._stage);

        // Making hotspot face the camera
        hotspot._anchor.style[style.TRANSFORM] =
            'translateY(' + R  * hotspot.meta.pitch.neg.sin + 'px) ' +
            'translateZ(' + -R * hotspot.meta.pitch.neg.cos + 'px) ' +
            'rotateX(' + -hotspot.meta.pitch + 'deg)';

        // Calculate the cartesian vector coordinates of the hotspot
        // hotspot.vector = cartesian(hsMeta.pitch, hsMeta.yaw);

        // Adding it to array and to DOM
        this.hotspots.push(hotspot);
        this._leanorama.appendChild(hotspot._container);

        bindings[hotspot.type] && bindings[hotspot.type](hotspot);
        hotspot.animationRules = {};
    }

    // Listening to the rotate event
    this._leanorama.addEventListener('rotate', (function(e) {
        for (var ix in this.hotspots) {
            var hotspot = this.hotspots[ix];

            // Applying rotation to each hotspot
            this.rotate.apply(hotspot, [
                this.pitch,
                this.yaw - hotspot.meta.yaw,
                e.detail.transitionTime
            ]);
        }
    }).bind(this));

    // Listening to the rotate event
    this._leanorama.addEventListener('startRotate', (function(e) {
        for (var ix in this.hotspots) {
            var hotspot = this.hotspots[ix];

            // Applying rotation to each hotspot
            this.startRotate.apply(hotspot, [
                e.detail.axis,
                e.detail.duration,
                e.detail.reverse
            ]);
        }
    }).bind(this));

    // Listening to the rotate event
    this._leanorama.addEventListener('stopRotate', (function(e) {
        for (var ix in this.hotspots) {
            var hotspot = this.hotspots[ix];

            // Applying rotation to each hotspot
            this.stopRotate.apply(hotspot, [
                e.detail.axis,
            ]);
        }
    }).bind(this));

    this.transitionEndHandlers.push((function(e) {
        // Update hotspot positioning on screen after animation
        for (var ix in this.hotspots) {
            var hotspot = this.hotspots[ix];

            // If the hotspot doesn't have corners defined, there's nothing to here
            if (!hotspot._corners) continue;

            // Set frustum
            var limits = {
                pitch: {
                    min: this.pitch.norm + 360 - this.fovH / 2,
                    max: this.pitch.norm + 360 + this.fovH / 2
                },
                yaw: {
                    min: this.yaw.norm + 360 - this.fovH / 2 / this.pitch.abs.cos,
                    max: this.yaw.norm + 360 + this.fovH / 2 / this.pitch.abs.cos
                }
            }

            var points = '';
            // This monstrosity performs the frustum culling. If hotspot is visible, construct its screen projection
            if (hotspot.meta.yaw.norm + 360 <= limits.yaw.max &&
                hotspot.meta.yaw.norm + 360 >= limits.yaw.min &&
                hotspot.meta.pitch.norm + 360 <= limits.pitch.max &&
                hotspot.meta.pitch.norm + 360 >= limits.pitch.min)

                hotspot._corners.forEach(function(corner) {
                    var rect = corner.getBoundingClientRect();
                    points += rect.left + ',' + rect.top + ' ';
                });

            hotspot._polygon.setAttribute('points', points);
        }
    }).bind(this));
});
