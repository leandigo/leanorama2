 /*
    LEANORAMA2 - HTML5 Viewer for Panoramas and Virtual Tours

    Copyright (c) 2014, Michael Greenberg (michael@leandigo.com)
    Released under the MIT License
 */

function Leanorama(options) {
    // CSS class maker. I'm very lazy.
    function cls() {
        var ret = arguments[0];
        for (var ix=1; ix<arguments.length; ix++) { ret += '-' + arguments[ix]; }
        return ret;
    }

    // Check which CSS3 properties are supported for current browser
    var style = {
        ANIMATION: ['webkitAnimation', 'animation'],
        PERSPECTIVE: ['webkitPerspective', 'perspective'],
        TRANSITION: ['webkitTransition', 'transition'],
        TRANSFORM: ['webkitTransform', 'transform'],
        TRANSFORM_ORIGIN: ['webkitTransformOrigin', 'transformOrigin']
    };
    for (var prop in style) for (var ix in style[prop]) if (Modernizr.testProp(style[prop][ix])) {
        style[prop] = style[prop][ix];
        break;
    }

    Leanorama.style = style;

    // The Angle constructor
    Leanorama.Angle = function(val, isRad) {        
        if (val instanceof Leanorama.Angle) val = val._deg.valueOf();

        this.init = function() {
            this.sin = Math.sin(this._rad);
            this.cos = Math.cos(this._rad);
            this.tan = Math.tan(this._rad);
            this.abs = this._deg >= 0 ? this : new Leanorama.Angle(Math.abs(this._deg));

            var norm = this._deg;
            while (norm > 180)  norm -= 360;
            while (norm < -180) norm += 360;
            this.norm = norm === this._deg ? this : new Leanorama.Angle(norm);
        }
        
        Object.defineProperty(this, 'neg', { get: (function() { return new Leanorama.Angle(-this._deg); }).bind(this) })

        Object.defineProperty(this, 'deg', {
            get: (function() { return this._deg }).bind(this),
            set: (function(val) { if (val == this) return; this._deg = val instanceof Leanorama.Angle ? val._deg : val; this._rad = val * Math.PI / 180; this.init() }).bind(this),
            configurable: true
        });

        Object.defineProperty(this, 'rad', {
            get: (function() { return this._rad }).bind(this),
            set: (function(val) { if (val == this) return; this._rad = val instanceof Leanorama.Angle ? val._deg : val; this._deg = val * 180 / Math.PI; this.init() }).bind(this),
            configurable: true
        });

        this[isRad ? 'rad': 'deg'] = val ? Number(val) : 0;
    }

    Leanorama.Angle.prototype = {
        valueOf: function() { return this._deg; },
        toString: function() { return this._deg.toString(); }
    }

    // Matrix decomposition function, based on Lvivski's answer:
    // http://stackoverflow.com/questions/15024828/transforming-3d-matrix-into-readable-format
    Leanorama.extractTransform = function(el) { // supports only scale*rotate*translate matrix
        var m = window.getComputedStyle(el, null)
            .getPropertyValue('-webkit-transform')
            .split('(')[1].split(')')[0].split(', ');

        var sX = Math.sqrt(m[0]*m[0] + m[1]*m[1] + m[2]*m[2]),
            sY = Math.sqrt(m[4]*m[4] + m[5]*m[5] + m[6]*m[6]),
            sZ = Math.sqrt(m[8]*m[8] + m[9]*m[9] + m[10]*m[10]);

        var rX = new Leanorama.Angle(Math.atan2(-m[9]/sZ, m[10]/sZ), true),
            rY = new Leanorama.Angle(Math.atan2(m[8]/sZ, m[10]/sZ), true),
            rZ = new Leanorama.Angle(Math.atan2(-m[4]/sY, m[0]/sX), true);

        if (m[4] === 1 || m[4] === -1) {
            rX = new Leanorama.Angle(0);
            rY = new Leanorama.Angle(m[4] * -Math.PI / 2);
            rZ = new Leanorama.Angle(m[4] * Math.atan2(m[6]/sY, m[5]/sY), true);
        }

        var tX = m[12] / sX,
            tY = m[13] / sX,
            tZ = m[14] / sX

        return {
            translate: { x: tX, y: tY, z: tZ },
            rotate: { x: rX, y: rY, z: rZ },
            scale: { x: sX, y: sY, z: sZ}
        }
    }

    // Local vars and constants
    var LEANORAMA = 'leanorama'
    ,   sides = ['front', 'right', 'back', 'left', 'up', 'down']
    ,   classes = {
            CONTAINER: 'container'
        ,   SCREEN: 'screen'
        ,   SIDE: 'side'
        ,   STAGE: 'stage'
        ,   CUBE: 'cube'
        }
    ;

    // The Object
    var leanorama = {

        // Iniitialization of the options, and setting the default values
        initOptions: function() {
            options.stepX               = options.stepX || 10;
            options.stepY               = options.stepY || 10;
            options.transitionTime      = options.transitionTime || '200ms';
            options.bindKeyboard        = options.bindKeyboard == false ? false : true;
            options.bindMouse           = options.bindMouse == false ? false : true;
            options.bindTouch           = options.bindTouch == false ? false : true;
//            options.bindGyro            = options.bindGyro == false ? false : true;
            options.autoRotate          = options.autoRotate || false;
            options.autoRotateDuration  = options.autoRotateDuration || 30;
            options.mouseSensitivity    = options.mouseSensitivity || 1;
            options.wheelSensitivity    = options.wheelSensitivity || 5;
            options.touchSensitivity    = options.touchSensitivity || 2;
            options.pitch               = options.pitch || 0;
            options.yaw                 = options.yaw || 0;

            // Set default perspective only if neither FOV nor perspective is set
            if (!(options.fovH || options.fovV)) options.fovH = 115;

            this.options = options;
        },

        _yaw: new Leanorama.Angle(),
        _pitch: new Leanorama.Angle(),

        init: function(scene) {
            // If scene not specified, load default. If no default specified, load at random
            if (!scene) for (var sceneName in options.scenes) if (options.scenes[sceneName].default) scene = sceneName;
            this.scene = options.scenes[scene || sceneName];

            // Initialize options
            this.initOptions();

            // Main Leanorama element
            this._leanorama = document.querySelector(options.selector);
            this._leanorama.classList.add(LEANORAMA);

            this._leanorama.innerHTML = '';

            // The screen
            this._screen = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            this._screen.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");
            this._screen.classList.add(cls(LEANORAMA, classes.SCREEN));

            // The container
            this._container = document.createElement('div');

            this._container.classList.add(cls(LEANORAMA, classes.CONTAINER));

            // The stage
            this._stage = document.createElement('div');
            this._stage.classList.add(cls(LEANORAMA, classes.STAGE));

            // The cube
            this._cube = document.createElement('div');
            this._cube.classList.add(cls(LEANORAMA, classes.CUBE));

            // Initialize sides
            sides.forEach(function(side) {
                var _side = document.createElement('div');
                _side.classList.add(cls(LEANORAMA, classes.SIDE));
                _side.classList.add(cls(LEANORAMA, side));
                _side.style.backgroundImage = 'url("' + this.scene.sides[side] + '")';
                this._cube.appendChild(_side);
            }, this);

            // Place everything on Leanorama
            this._leanorama.appendChild(this._container);
            this._container.appendChild(this._stage);
            this._stage.appendChild(this._cube);
            this._leanorama.appendChild(this._screen);

            // Bind inputs
            if (options.bindKeyboard) this.bindKeyboard();
            if (options.bindMouse) this.bindMouse();
            if (options.bindTouch) this.bindTouch();
//            if (options.bindGyro) this.bindGyro();

            // Set initial rotation
            this.pitch = options.pitch;
            this.yaw = options.yaw;

            // Calculate FOV
            this.calculateFov();

            // Initialize extensions and let's go
            for (var ix in Leanorama.extensions) Leanorama.extensions[ix].bind(this)();

            this.rotate(this.pitch, this.yaw, 0);

            return this;
        },

        transitionEndHandlers: [],
        transitionEnd: function() {
            this.transitionEndHandlers.forEach((function(fn) { fn.apply(this) }).bind(this));
        },

        // Perform the rotation transition
        rotate: function(pitch, yaw, transitionTime, blocking) {
            
            // Set new rotate properties
            this.pitch = pitch;
            this.yaw = yaw;

            if (!(this.pitch instanceof Leanorama.Angle)) this.pitch = new Leanorama.Angle(pitch);
            if (!(this.yaw instanceof Leanorama.Angle)) this.yaw = new Leanorama.Angle(yaw);

            // Set the time for transition - if none specified, use the one from the options
            transitionTime = transitionTime >= 0 ? transitionTime : options.transitionTime;

            // Rotate stage (X only)
            var stageTransform = 'perspective(' + options.perspective + 'px) translateZ(' + options.perspective + 'px) rotateX(' + pitch + 'deg)';
            this._stage.style[style.TRANSITION] = transitionTime ? transitionTime + ' linear' : '';
            this._stage.style[style.TRANSFORM] = stageTransform;

            // Rotate cube (Y only)
            var cubeTransform = 'rotateY(' + yaw + 'deg)';
            this._cube.style[style.TRANSITION] = transitionTime ? transitionTime + ' linear' : '';
            this._cube.style[style.TRANSFORM] = cubeTransform;

            // If method is called on the Leanorama object, dispatch rotate event
            if (this._leanorama) {
                this._leanorama.dispatchEvent(new CustomEvent("rotate", {detail: { transitionTime: transitionTime }}));
            }
        },

        // Performs zoom by changing Horizontal FOV
        zoomTo: function(fovH, transitionTime) {
            // Set new FoV
            this.fovH = fovH;

            // Unset perspective, and run calculateFov(). This will calculate new perspective
            options.perspective = undefined;
            this.calculateFov();

            // Call rotation method with no actual rotation, to initiate transition
            this.rotate(this.pitch, this.yaw, transitionTime);
        },

        // Bind gyro
        /* (much) later.
        bindGyro: function() {
            if (!window.DeviceOrientationEvent) return;
            var initAngles;

            // Accelerometer goes AWOL. Will try using rotationrate with timer to stabilize
            window.addEventListener('deviceorientation', (function(e) {
                if (!initAngles) {
                    initAngles = {
                        alpha: parseFloat(e.alpha.toFixed(1))
                    ,   gamma: parseFloat(e.gamma.toFixed(1))
                    };
                }

                // Perform rotation and reset initial values
                this.rotate(initAngles.gamma - parseFloat(e.gamma.toFixed(1)), initAngles.alpha - parseFloat(e.alpha.toFixed(1)), 0);

            }).bind(this));

            //window.setInterval(())
        }, */

        // Bind touch
        bindTouch: function() {
            if (this.bindTouch.bound) return;
            var touching = false
            ,   x0 = []
            ,   y0 = []
            ;

            // Bind touchStart event - register start positions of touches
            this._stage.addEventListener('touchstart', (function(e) {
                touching = true;
                for (var touchIx=0; touchIx<e.touches.length; touchIx++) {
                    x0[touchIx] = e.touches[touchIx].screenX;
                    y0[touchIx] = e.touches[touchIx].screenY;
                }
            }).bind(this));

            // Bind touchMove event - fingers are moving
            this._stage.addEventListener('touchmove', (function(e) {
                e.preventDefault();

                // 1 touch means rotation
                if (e.touches.length == 1) {
                    // Calculate the delta, transform to degrees, and apply mouse sensitivity
                    var dX = (e.touches[0].screenX - x0[0]) * this.fovV / this.height * options.touchSensitivity
                    ,   dY = (e.touches[0].screenY - y0[0]) * this.fovH / this.width  * options.touchSensitivity
                    ;

                    // Perform rotation and reset initial values
                    this.rotate(this.pitch + dY, this.yaw - dX, 0);
                    x0[0] = e.touches[0].screenX;
                    y0[0] = e.touches[0].screenY;
                }
            }).bind(this));

            // Bind touchEnd event - at the meantime, this does nothing
            this._stage.addEventListener('touchend', (function(e) {
                touching = false;
            }).bind(this));
            this.bindTouch.bound = true;
        },

        // Bind mouse
        bindMouse: function() {
            if (this.bindMouse.bound) return;
            var mouseDown = false
            ,   x0
            ,   y0
            ;

            // Bind the mouseDown event - start motion when mouse button is pressed
            this._screen.addEventListener('mousedown', (function(e) {
                mouseDown = true;
                x0 = e.x || e.screenX;
                y0 = e.y || e.screenY;
                // Set cursor to "move"
                this._leanorama.style.cursor = 'move';
            }).bind(this));

            // Bind the mouseMove event - perform rotation if mouse button is pressed
            this._screen.addEventListener('mousemove', (function(e) {
                if (!mouseDown) return;

                // Calculate the delta, transform to degrees, and apply mouse sensitivity
                var dX = ((e.x || e.screenX) - x0) * this.fovV / this.height * options.mouseSensitivity
                ,   dY = ((e.y || e.screenY) - y0) * this.fovH / this.width  * options.mouseSensitivity
                ;

                // Perform rotation and reset initial values
                this.rotate(this.pitch + dY, this.yaw - dX, 0);
                x0 = e.x || e.screenX;
                y0 = e.y || e.screenY;
            }).bind(this));

            // Bind the mouseUp event - end motion and set automatic cursor
            this._screen.addEventListener('mouseup', (function(e) {
                mouseDown = false;
                this._leanorama.style.cursor = 'auto';
                this.transitionEnd();
            }).bind(this));

            // Bind the mouse wheel event (mouseWheel or wheel) - perform zoom
            this._screen.addEventListener(Modernizr.hasEvent('mousewheel') ? 'mousewheel' : 'wheel', (function(e) {
                var delta = e.wheelDelta || e.wheelDeltaY || e.deltaY;
                var fovH = this.fovH += (delta / Math.abs(delta) * options.wheelSensitivity);
                this.zoomTo(fovH, 50);
            }).bind(this));

            this.bindMouse.bound = true;
        },

        transitionInputs: [],

        // Bind keyboard
        bindKeyboard: function() {
            if (this.bindKeyboard.bound) return;

            var key = {UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39, PLUS: 187, MINUS: 189}

            var actions = {}
            actions[key.UP]    = { action: 'rotate', axis: 'pitch' };
            actions[key.DOWN]  = { action: 'rotate', axis: 'pitch', reverse: true };
            actions[key.RIGHT] = { action: 'rotate', axis: 'yaw' };
            actions[key.LEFT]  = { action: 'rotate', axis: 'yaw', reverse: true };

            window.addEventListener('keydown', (function(e) {
                if (e.which == 32) this.toggleAutoRotate();
                var action = actions[e.which];
                if (!action || action.inProgress) return;
                action.inProgress = true;
                if (action.action = 'rotate') this.startRotate(action.axis, 10, action.reverse);
            }).bind(this));

            window.addEventListener('keyup', (function(e) {
                var action = actions[e.which];
                if (!action) return;
                if (action.action = 'rotate') this.stopRotate(action.axis);
                action.inProgress = false;
            }).bind(this));

            this.bindKeyboard.bound = true;
        },

        animationRules: {},

        startZoom: function(reverse) {
            // duration = duration || 300;
            var ruleName = 'leanorama-zoom-' + Math.random().toString().split('.')[1];
            var perspective0 = options.perspective;
            var perspective1 = reverse ? 1 : 10000;
            var duration = Math.abs(perspective0 - perspective1) / 200;
            var transform0 = 'perspective(' + perspective0 + 'px) translateZ(' + perspective0 + 'px) rotateX(' + this.pitch + 'deg)';
            var transform1 = 'perspective(' + perspective1 + 'px) translateZ(' + perspective1 + 'px) rotateX(' + this.pitch + 'deg)';
            var rule = 
                '@-webkit-keyframes ' + ruleName + ' { \n' +
                    '0% { -webkit-transform: ' + transform0 + '} \n' +
                    '100% { -webkit-transform: ' + transform1 + ' } \n' +
                '}';
            document.styleSheets[0].insertRule(rule, 0);
            this._stage.style[style.ANIMATION] = ruleName + ' ' + duration + 's infinite linear';
            this.animationRules['zoom'] = ruleName;
        
            if (this._leanorama) {
                this._leanorama.dispatchEvent(
                    new CustomEvent('startZoom',
                        { detail: { reverse: reverse } })
                );
            }
        },

        stopZoom: function() {
            this._stage.style.webkitAnimationPlayState = 'paused';
            window.setTimeout((function() {
                if (this._leanorama) {
                    options.perspective = Leanorama.extractTransform(this._stage).translate.z;
                    console.log(options.perspective);
                    // this.calculateFov(true);
                    // this.rotate(this.pitch, this.yaw, 0);
                    this._leanorama.dispatchEvent(new CustomEvent('stopZoom'));
                }
                this._stage.style[style.ANIMATION] = '';                
            }).bind(this), 1000);

            // this._stage.classList.remove('leanorama-pause');
        },

        startRotate: function(axis, duration, reverse) {
            var ruleName = 'leanorama-rotate-' + axis + '-' + Math.random().toString().split('.')[1];
            var angle = axis == 'yaw' ? this.yaw.norm : this.pitch.norm;
            var transform0 = axis == 'yaw' ?
                'rotateY(' + angle + 'deg);' :
                'perspective(' + options.perspective + 'px) translateZ(' + options.perspective + 'px) rotateX(' + angle + 'deg)';
            var transform1 = axis == 'yaw' ?
                'rotateY(' + (angle + (reverse ? -360 : 360)) + 'deg);' :
                'perspective(' + options.perspective + 'px) translateZ(' + options.perspective + 'px) rotateX(' + (angle + (reverse ? -360 : 360)) + 'deg)';

            var rule = 
                '@-webkit-keyframes ' + ruleName + ' { \n' +
                    '0% { -webkit-transform: ' + transform0 + '} \n' +
                    '100% { -webkit-transform: ' + transform1 + ' } \n' +
                '}';
            document.styleSheets[0].insertRule(rule, 0);
            this[axis == 'yaw' ? '_cube' : '_stage'].style[style.ANIMATION] = ruleName + ' ' + duration + 's infinite linear';
            this.animationRules[axis] = ruleName;
            
            if (this._leanorama) {
                this._leanorama.dispatchEvent(
                    new CustomEvent('startRotate',
                        { detail: { axis: axis, duration: duration, reverse: reverse } })
                );
            }
        },

        stopRotate: function(axis) {
            if (!this.animationRules[axis]) return;
            var isYaw = axis == 'yaw';
            var isPitch = !isYaw;
            var el = this[axis == 'pitch' ? '_stage' : '_cube'];
            var angle = Leanorama.extractTransform(el).rotate[isPitch ? 'x' : 'y'];
            el.style[style.ANIMATION] = '';
            
            if (this._leanorama) {
                this.rotate(isPitch ? angle : this.pitch, isYaw ? angle : this.yaw, 0);
                this._leanorama.dispatchEvent(
                    new CustomEvent('stopRotate',
                        { detail: { axis: axis } })
                );
            }

            for (var jx in document.styleSheets[0].rules) {
                if (this.animationRules[axis] == document.styleSheets[0].rules[jx].name) {
                    document.styleSheets[0].removeRule(jx);
                    break;
                }
            }
            this.animationRules[axis] = undefined;
        },

        toggleAutoRotate: function() {
            this.autoRotate ? this.stopRotate('yaw') : this.startRotate('yaw', options.autoRotateDuration);
            this.autoRotate = !this.autoRotate;
        },

        // Calculate FOV
        calculateFov: function(fromPerspective) {

            // Get width and height
            var rect = this._leanorama.getBoundingClientRect();
            this.width  = rect.width;
            this.height = rect.height;

            var fovH = fromPerspective ? undefined : new Leanorama.Angle(this.fovH || options.fovH);
            var fovV = fromPerspective ? undefined : new Leanorama.Angle(this.fovV || options.fovV);

            // Calculate perspective, if missing
            if (!options.perspective) {
                options.perspective =
                    0.5 * this.width / Math.tan(fovH.rad / 2);
                this._container.style[style.TRANSFORM] = 'perspective(' + options.perspective + 'px)';
            }

            // Calculate horizontal FOV (fovH) and vertical FOV (fovV), if missing
            this.fovH = fovH || new Leanorama.Angle(2 * Math.atan(0.5 * this.width  / options.perspective), true);
            this.fovV = new Leanorama.Angle(2 * Math.atan(0.5 * this.height / options.perspective), true);
        }
    };

    Object.defineProperty(leanorama, 'yaw',   { set: function(deg) { leanorama._yaw.deg   = deg; }, get: function() { return leanorama._yaw } });
    Object.defineProperty(leanorama, 'pitch', { set: function(deg) { leanorama._pitch.deg = deg; }, get: function() { return leanorama._pitch } });

    // Initialize and return
    return leanorama.init();
}

Leanorama.extensions = [];
