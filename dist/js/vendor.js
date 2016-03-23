/*!
Waypoints - 4.0.0
Copyright © 2011-2015 Caleb Troughton
Licensed under the MIT license.
https://github.com/imakewebthings/waypoints/blog/master/licenses.txt
*/
(function() {
  'use strict'

  var keyCounter = 0
  var allWaypoints = {}

  /* http://imakewebthings.com/waypoints/api/waypoint */
  function Waypoint(options) {
    if (!options) {
      throw new Error('No options passed to Waypoint constructor')
    }
    if (!options.element) {
      throw new Error('No element option passed to Waypoint constructor')
    }
    if (!options.handler) {
      throw new Error('No handler option passed to Waypoint constructor')
    }

    this.key = 'waypoint-' + keyCounter
    this.options = Waypoint.Adapter.extend({}, Waypoint.defaults, options)
    this.element = this.options.element
    this.adapter = new Waypoint.Adapter(this.element)
    this.callback = options.handler
    this.axis = this.options.horizontal ? 'horizontal' : 'vertical'
    this.enabled = this.options.enabled
    this.triggerPoint = null
    this.group = Waypoint.Group.findOrCreate({
      name: this.options.group,
      axis: this.axis
    })
    this.context = Waypoint.Context.findOrCreateByElement(this.options.context)

    if (Waypoint.offsetAliases[this.options.offset]) {
      this.options.offset = Waypoint.offsetAliases[this.options.offset]
    }
    this.group.add(this)
    this.context.add(this)
    allWaypoints[this.key] = this
    keyCounter += 1
  }

  /* Private */
  Waypoint.prototype.queueTrigger = function(direction) {
    this.group.queueTrigger(this, direction)
  }

  /* Private */
  Waypoint.prototype.trigger = function(args) {
    if (!this.enabled) {
      return
    }
    if (this.callback) {
      this.callback.apply(this, args)
    }
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/destroy */
  Waypoint.prototype.destroy = function() {
    this.context.remove(this)
    this.group.remove(this)
    delete allWaypoints[this.key]
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/disable */
  Waypoint.prototype.disable = function() {
    this.enabled = false
    return this
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/enable */
  Waypoint.prototype.enable = function() {
    this.context.refresh()
    this.enabled = true
    return this
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/next */
  Waypoint.prototype.next = function() {
    return this.group.next(this)
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/previous */
  Waypoint.prototype.previous = function() {
    return this.group.previous(this)
  }

  /* Private */
  Waypoint.invokeAll = function(method) {
    var allWaypointsArray = []
    for (var waypointKey in allWaypoints) {
      allWaypointsArray.push(allWaypoints[waypointKey])
    }
    for (var i = 0, end = allWaypointsArray.length; i < end; i++) {
      allWaypointsArray[i][method]()
    }
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/destroy-all */
  Waypoint.destroyAll = function() {
    Waypoint.invokeAll('destroy')
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/disable-all */
  Waypoint.disableAll = function() {
    Waypoint.invokeAll('disable')
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/enable-all */
  Waypoint.enableAll = function() {
    Waypoint.invokeAll('enable')
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/refresh-all */
  Waypoint.refreshAll = function() {
    Waypoint.Context.refreshAll()
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/viewport-height */
  Waypoint.viewportHeight = function() {
    return window.innerHeight || document.documentElement.clientHeight
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/viewport-width */
  Waypoint.viewportWidth = function() {
    return document.documentElement.clientWidth
  }

  Waypoint.adapters = []

  Waypoint.defaults = {
    context: window,
    continuous: true,
    enabled: true,
    group: 'default',
    horizontal: false,
    offset: 0
  }

  Waypoint.offsetAliases = {
    'bottom-in-view': function() {
      return this.context.innerHeight() - this.adapter.outerHeight()
    },
    'right-in-view': function() {
      return this.context.innerWidth() - this.adapter.outerWidth()
    }
  }

  window.Waypoint = Waypoint
}())
;(function() {
  'use strict'

  function requestAnimationFrameShim(callback) {
    window.setTimeout(callback, 1000 / 60)
  }

  var keyCounter = 0
  var contexts = {}
  var Waypoint = window.Waypoint
  var oldWindowLoad = window.onload

  /* http://imakewebthings.com/waypoints/api/context */
  function Context(element) {
    this.element = element
    this.Adapter = Waypoint.Adapter
    this.adapter = new this.Adapter(element)
    this.key = 'waypoint-context-' + keyCounter
    this.didScroll = false
    this.didResize = false
    this.oldScroll = {
      x: this.adapter.scrollLeft(),
      y: this.adapter.scrollTop()
    }
    this.waypoints = {
      vertical: {},
      horizontal: {}
    }

    element.waypointContextKey = this.key
    contexts[element.waypointContextKey] = this
    keyCounter += 1

    this.createThrottledScrollHandler()
    this.createThrottledResizeHandler()
  }

  /* Private */
  Context.prototype.add = function(waypoint) {
    var axis = waypoint.options.horizontal ? 'horizontal' : 'vertical'
    this.waypoints[axis][waypoint.key] = waypoint
    this.refresh()
  }

  /* Private */
  Context.prototype.checkEmpty = function() {
    var horizontalEmpty = this.Adapter.isEmptyObject(this.waypoints.horizontal)
    var verticalEmpty = this.Adapter.isEmptyObject(this.waypoints.vertical)
    if (horizontalEmpty && verticalEmpty) {
      this.adapter.off('.waypoints')
      delete contexts[this.key]
    }
  }

  /* Private */
  Context.prototype.createThrottledResizeHandler = function() {
    var self = this

    function resizeHandler() {
      self.handleResize()
      self.didResize = false
    }

    this.adapter.on('resize.waypoints', function() {
      if (!self.didResize) {
        self.didResize = true
        Waypoint.requestAnimationFrame(resizeHandler)
      }
    })
  }

  /* Private */
  Context.prototype.createThrottledScrollHandler = function() {
    var self = this
    function scrollHandler() {
      self.handleScroll()
      self.didScroll = false
    }

    this.adapter.on('scroll.waypoints', function() {
      if (!self.didScroll || Waypoint.isTouch) {
        self.didScroll = true
        Waypoint.requestAnimationFrame(scrollHandler)
      }
    })
  }

  /* Private */
  Context.prototype.handleResize = function() {
    Waypoint.Context.refreshAll()
  }

  /* Private */
  Context.prototype.handleScroll = function() {
    var triggeredGroups = {}
    var axes = {
      horizontal: {
        newScroll: this.adapter.scrollLeft(),
        oldScroll: this.oldScroll.x,
        forward: 'right',
        backward: 'left'
      },
      vertical: {
        newScroll: this.adapter.scrollTop(),
        oldScroll: this.oldScroll.y,
        forward: 'down',
        backward: 'up'
      }
    }

    for (var axisKey in axes) {
      var axis = axes[axisKey]
      var isForward = axis.newScroll > axis.oldScroll
      var direction = isForward ? axis.forward : axis.backward

      for (var waypointKey in this.waypoints[axisKey]) {
        var waypoint = this.waypoints[axisKey][waypointKey]
        var wasBeforeTriggerPoint = axis.oldScroll < waypoint.triggerPoint
        var nowAfterTriggerPoint = axis.newScroll >= waypoint.triggerPoint
        var crossedForward = wasBeforeTriggerPoint && nowAfterTriggerPoint
        var crossedBackward = !wasBeforeTriggerPoint && !nowAfterTriggerPoint
        if (crossedForward || crossedBackward) {
          waypoint.queueTrigger(direction)
          triggeredGroups[waypoint.group.id] = waypoint.group
        }
      }
    }

    for (var groupKey in triggeredGroups) {
      triggeredGroups[groupKey].flushTriggers()
    }

    this.oldScroll = {
      x: axes.horizontal.newScroll,
      y: axes.vertical.newScroll
    }
  }

  /* Private */
  Context.prototype.innerHeight = function() {
    /*eslint-disable eqeqeq */
    if (this.element == this.element.window) {
      return Waypoint.viewportHeight()
    }
    /*eslint-enable eqeqeq */
    return this.adapter.innerHeight()
  }

  /* Private */
  Context.prototype.remove = function(waypoint) {
    delete this.waypoints[waypoint.axis][waypoint.key]
    this.checkEmpty()
  }

  /* Private */
  Context.prototype.innerWidth = function() {
    /*eslint-disable eqeqeq */
    if (this.element == this.element.window) {
      return Waypoint.viewportWidth()
    }
    /*eslint-enable eqeqeq */
    return this.adapter.innerWidth()
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/context-destroy */
  Context.prototype.destroy = function() {
    var allWaypoints = []
    for (var axis in this.waypoints) {
      for (var waypointKey in this.waypoints[axis]) {
        allWaypoints.push(this.waypoints[axis][waypointKey])
      }
    }
    for (var i = 0, end = allWaypoints.length; i < end; i++) {
      allWaypoints[i].destroy()
    }
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/context-refresh */
  Context.prototype.refresh = function() {
    /*eslint-disable eqeqeq */
    var isWindow = this.element == this.element.window
    /*eslint-enable eqeqeq */
    var contextOffset = isWindow ? undefined : this.adapter.offset()
    var triggeredGroups = {}
    var axes

    this.handleScroll()
    axes = {
      horizontal: {
        contextOffset: isWindow ? 0 : contextOffset.left,
        contextScroll: isWindow ? 0 : this.oldScroll.x,
        contextDimension: this.innerWidth(),
        oldScroll: this.oldScroll.x,
        forward: 'right',
        backward: 'left',
        offsetProp: 'left'
      },
      vertical: {
        contextOffset: isWindow ? 0 : contextOffset.top,
        contextScroll: isWindow ? 0 : this.oldScroll.y,
        contextDimension: this.innerHeight(),
        oldScroll: this.oldScroll.y,
        forward: 'down',
        backward: 'up',
        offsetProp: 'top'
      }
    }

    for (var axisKey in axes) {
      var axis = axes[axisKey]
      for (var waypointKey in this.waypoints[axisKey]) {
        var waypoint = this.waypoints[axisKey][waypointKey]
        var adjustment = waypoint.options.offset
        var oldTriggerPoint = waypoint.triggerPoint
        var elementOffset = 0
        var freshWaypoint = oldTriggerPoint == null
        var contextModifier, wasBeforeScroll, nowAfterScroll
        var triggeredBackward, triggeredForward

        if (waypoint.element !== waypoint.element.window) {
          elementOffset = waypoint.adapter.offset()[axis.offsetProp]
        }

        if (typeof adjustment === 'function') {
          adjustment = adjustment.apply(waypoint)
        }
        else if (typeof adjustment === 'string') {
          adjustment = parseFloat(adjustment)
          if (waypoint.options.offset.indexOf('%') > - 1) {
            adjustment = Math.ceil(axis.contextDimension * adjustment / 100)
          }
        }

        contextModifier = axis.contextScroll - axis.contextOffset
        waypoint.triggerPoint = elementOffset + contextModifier - adjustment
        wasBeforeScroll = oldTriggerPoint < axis.oldScroll
        nowAfterScroll = waypoint.triggerPoint >= axis.oldScroll
        triggeredBackward = wasBeforeScroll && nowAfterScroll
        triggeredForward = !wasBeforeScroll && !nowAfterScroll

        if (!freshWaypoint && triggeredBackward) {
          waypoint.queueTrigger(axis.backward)
          triggeredGroups[waypoint.group.id] = waypoint.group
        }
        else if (!freshWaypoint && triggeredForward) {
          waypoint.queueTrigger(axis.forward)
          triggeredGroups[waypoint.group.id] = waypoint.group
        }
        else if (freshWaypoint && axis.oldScroll >= waypoint.triggerPoint) {
          waypoint.queueTrigger(axis.forward)
          triggeredGroups[waypoint.group.id] = waypoint.group
        }
      }
    }

    Waypoint.requestAnimationFrame(function() {
      for (var groupKey in triggeredGroups) {
        triggeredGroups[groupKey].flushTriggers()
      }
    })

    return this
  }

  /* Private */
  Context.findOrCreateByElement = function(element) {
    return Context.findByElement(element) || new Context(element)
  }

  /* Private */
  Context.refreshAll = function() {
    for (var contextId in contexts) {
      contexts[contextId].refresh()
    }
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/context-find-by-element */
  Context.findByElement = function(element) {
    return contexts[element.waypointContextKey]
  }

  window.onload = function() {
    if (oldWindowLoad) {
      oldWindowLoad()
    }
    Context.refreshAll()
  }

  Waypoint.requestAnimationFrame = function(callback) {
    var requestFn = window.requestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      requestAnimationFrameShim
    requestFn.call(window, callback)
  }
  Waypoint.Context = Context
}())
;(function() {
  'use strict'

  function byTriggerPoint(a, b) {
    return a.triggerPoint - b.triggerPoint
  }

  function byReverseTriggerPoint(a, b) {
    return b.triggerPoint - a.triggerPoint
  }

  var groups = {
    vertical: {},
    horizontal: {}
  }
  var Waypoint = window.Waypoint

  /* http://imakewebthings.com/waypoints/api/group */
  function Group(options) {
    this.name = options.name
    this.axis = options.axis
    this.id = this.name + '-' + this.axis
    this.waypoints = []
    this.clearTriggerQueues()
    groups[this.axis][this.name] = this
  }

  /* Private */
  Group.prototype.add = function(waypoint) {
    this.waypoints.push(waypoint)
  }

  /* Private */
  Group.prototype.clearTriggerQueues = function() {
    this.triggerQueues = {
      up: [],
      down: [],
      left: [],
      right: []
    }
  }

  /* Private */
  Group.prototype.flushTriggers = function() {
    for (var direction in this.triggerQueues) {
      var waypoints = this.triggerQueues[direction]
      var reverse = direction === 'up' || direction === 'left'
      waypoints.sort(reverse ? byReverseTriggerPoint : byTriggerPoint)
      for (var i = 0, end = waypoints.length; i < end; i += 1) {
        var waypoint = waypoints[i]
        if (waypoint.options.continuous || i === waypoints.length - 1) {
          waypoint.trigger([direction])
        }
      }
    }
    this.clearTriggerQueues()
  }

  /* Private */
  Group.prototype.next = function(waypoint) {
    this.waypoints.sort(byTriggerPoint)
    var index = Waypoint.Adapter.inArray(waypoint, this.waypoints)
    var isLast = index === this.waypoints.length - 1
    return isLast ? null : this.waypoints[index + 1]
  }

  /* Private */
  Group.prototype.previous = function(waypoint) {
    this.waypoints.sort(byTriggerPoint)
    var index = Waypoint.Adapter.inArray(waypoint, this.waypoints)
    return index ? this.waypoints[index - 1] : null
  }

  /* Private */
  Group.prototype.queueTrigger = function(waypoint, direction) {
    this.triggerQueues[direction].push(waypoint)
  }

  /* Private */
  Group.prototype.remove = function(waypoint) {
    var index = Waypoint.Adapter.inArray(waypoint, this.waypoints)
    if (index > -1) {
      this.waypoints.splice(index, 1)
    }
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/first */
  Group.prototype.first = function() {
    return this.waypoints[0]
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/last */
  Group.prototype.last = function() {
    return this.waypoints[this.waypoints.length - 1]
  }

  /* Private */
  Group.findOrCreate = function(options) {
    return groups[options.axis][options.name] || new Group(options)
  }

  Waypoint.Group = Group
}())
;(function() {
  'use strict'

  var Waypoint = window.Waypoint

  function isWindow(element) {
    return element === element.window
  }

  function getWindow(element) {
    if (isWindow(element)) {
      return element
    }
    return element.defaultView
  }

  function NoFrameworkAdapter(element) {
    this.element = element
    this.handlers = {}
  }

  NoFrameworkAdapter.prototype.innerHeight = function() {
    var isWin = isWindow(this.element)
    return isWin ? this.element.innerHeight : this.element.clientHeight
  }

  NoFrameworkAdapter.prototype.innerWidth = function() {
    var isWin = isWindow(this.element)
    return isWin ? this.element.innerWidth : this.element.clientWidth
  }

  NoFrameworkAdapter.prototype.off = function(event, handler) {
    function removeListeners(element, listeners, handler) {
      for (var i = 0, end = listeners.length - 1; i < end; i++) {
        var listener = listeners[i]
        if (!handler || handler === listener) {
          element.removeEventListener(listener)
        }
      }
    }

    var eventParts = event.split('.')
    var eventType = eventParts[0]
    var namespace = eventParts[1]
    var element = this.element

    if (namespace && this.handlers[namespace] && eventType) {
      removeListeners(element, this.handlers[namespace][eventType], handler)
      this.handlers[namespace][eventType] = []
    }
    else if (eventType) {
      for (var ns in this.handlers) {
        removeListeners(element, this.handlers[ns][eventType] || [], handler)
        this.handlers[ns][eventType] = []
      }
    }
    else if (namespace && this.handlers[namespace]) {
      for (var type in this.handlers[namespace]) {
        removeListeners(element, this.handlers[namespace][type], handler)
      }
      this.handlers[namespace] = {}
    }
  }

  /* Adapted from jQuery 1.x offset() */
  NoFrameworkAdapter.prototype.offset = function() {
    if (!this.element.ownerDocument) {
      return null
    }

    var documentElement = this.element.ownerDocument.documentElement
    var win = getWindow(this.element.ownerDocument)
    var rect = {
      top: 0,
      left: 0
    }

    if (this.element.getBoundingClientRect) {
      rect = this.element.getBoundingClientRect()
    }

    return {
      top: rect.top + win.pageYOffset - documentElement.clientTop,
      left: rect.left + win.pageXOffset - documentElement.clientLeft
    }
  }

  NoFrameworkAdapter.prototype.on = function(event, handler) {
    var eventParts = event.split('.')
    var eventType = eventParts[0]
    var namespace = eventParts[1] || '__default'
    var nsHandlers = this.handlers[namespace] = this.handlers[namespace] || {}
    var nsTypeList = nsHandlers[eventType] = nsHandlers[eventType] || []

    nsTypeList.push(handler)
    this.element.addEventListener(eventType, handler)
  }

  NoFrameworkAdapter.prototype.outerHeight = function(includeMargin) {
    var height = this.innerHeight()
    var computedStyle

    if (includeMargin && !isWindow(this.element)) {
      computedStyle = window.getComputedStyle(this.element)
      height += parseInt(computedStyle.marginTop, 10)
      height += parseInt(computedStyle.marginBottom, 10)
    }

    return height
  }

  NoFrameworkAdapter.prototype.outerWidth = function(includeMargin) {
    var width = this.innerWidth()
    var computedStyle

    if (includeMargin && !isWindow(this.element)) {
      computedStyle = window.getComputedStyle(this.element)
      width += parseInt(computedStyle.marginLeft, 10)
      width += parseInt(computedStyle.marginRight, 10)
    }

    return width
  }

  NoFrameworkAdapter.prototype.scrollLeft = function() {
    var win = getWindow(this.element)
    return win ? win.pageXOffset : this.element.scrollLeft
  }

  NoFrameworkAdapter.prototype.scrollTop = function() {
    var win = getWindow(this.element)
    return win ? win.pageYOffset : this.element.scrollTop
  }

  NoFrameworkAdapter.extend = function() {
    var args = Array.prototype.slice.call(arguments)

    function merge(target, obj) {
      if (typeof target === 'object' && typeof obj === 'object') {
        for (var key in obj) {
          if (obj.hasOwnProperty(key)) {
            target[key] = obj[key]
          }
        }
      }

      return target
    }

    for (var i = 1, end = args.length; i < end; i++) {
      merge(args[0], args[i])
    }
    return args[0]
  }

  NoFrameworkAdapter.inArray = function(element, array, i) {
    return array == null ? -1 : array.indexOf(element, i)
  }

  NoFrameworkAdapter.isEmptyObject = function(obj) {
    /* eslint no-unused-vars: 0 */
    for (var name in obj) {
      return false
    }
    return true
  }

  Waypoint.adapters.push({
    name: 'noframework',
    Adapter: NoFrameworkAdapter
  })
  Waypoint.Adapter = NoFrameworkAdapter
}())
;
/*! lightslider - v1.1.5 - 2015-10-31
* https://github.com/sachinchoolur/lightslider
* Copyright (c) 2015 Sachin N; Licensed MIT */
!function(a,b){"use strict";var c={item:3,autoWidth:!1,slideMove:1,slideMargin:10,addClass:"",mode:"slide",useCSS:!0,cssEasing:"ease",easing:"linear",speed:400,auto:!1,pauseOnHover:!1,loop:!1,slideEndAnimation:!0,pause:2e3,keyPress:!1,controls:!0,prevHtml:"",nextHtml:"",rtl:!1,adaptiveHeight:!1,vertical:!1,verticalHeight:500,vThumbWidth:100,thumbItem:10,pager:!0,gallery:!1,galleryMargin:5,thumbMargin:5,currentPagerPosition:"middle",enableTouch:!0,enableDrag:!0,freeMove:!0,swipeThreshold:40,responsive:[],onBeforeStart:function(a){},onSliderLoad:function(a){},onBeforeSlide:function(a,b){},onAfterSlide:function(a,b){},onBeforeNextSlide:function(a,b){},onBeforePrevSlide:function(a,b){}};a.fn.lightSlider=function(b){if(0===this.length)return this;if(this.length>1)return this.each(function(){a(this).lightSlider(b)}),this;var d={},e=a.extend(!0,{},c,b),f={},g=this;d.$el=this,"fade"===e.mode&&(e.vertical=!1);var h=g.children(),i=a(window).width(),j=null,k=null,l=0,m=0,n=!1,o=0,p="",q=0,r=e.vertical===!0?"height":"width",s=e.vertical===!0?"margin-bottom":"margin-right",t=0,u=0,v=0,w=0,x=null,y="ontouchstart"in document.documentElement,z={};return z.chbreakpoint=function(){if(i=a(window).width(),e.responsive.length){var b;if(e.autoWidth===!1&&(b=e.item),i<e.responsive[0].breakpoint)for(var c=0;c<e.responsive.length;c++)i<e.responsive[c].breakpoint&&(j=e.responsive[c].breakpoint,k=e.responsive[c]);if("undefined"!=typeof k&&null!==k)for(var d in k.settings)k.settings.hasOwnProperty(d)&&(("undefined"==typeof f[d]||null===f[d])&&(f[d]=e[d]),e[d]=k.settings[d]);if(!a.isEmptyObject(f)&&i>e.responsive[0].breakpoint)for(var g in f)f.hasOwnProperty(g)&&(e[g]=f[g]);e.autoWidth===!1&&t>0&&v>0&&b!==e.item&&(q=Math.round(t/((v+e.slideMargin)*e.slideMove)))}},z.calSW=function(){e.autoWidth===!1&&(v=(o-(e.item*e.slideMargin-e.slideMargin))/e.item)},z.calWidth=function(a){var b=a===!0?p.find(".lslide").length:h.length;if(e.autoWidth===!1)m=b*(v+e.slideMargin);else{m=0;for(var c=0;b>c;c++)m+=parseInt(h.eq(c).width())+e.slideMargin}return m},d={doCss:function(){var a=function(){for(var a=["transition","MozTransition","WebkitTransition","OTransition","msTransition","KhtmlTransition"],b=document.documentElement,c=0;c<a.length;c++)if(a[c]in b.style)return!0};return e.useCSS&&a()?!0:!1},keyPress:function(){e.keyPress&&a(document).on("keyup.lightslider",function(b){a(":focus").is("input, textarea")||(b.preventDefault?b.preventDefault():b.returnValue=!1,37===b.keyCode?g.goToPrevSlide():39===b.keyCode&&g.goToNextSlide())})},controls:function(){e.controls&&(g.after('<div class="lSAction"><a class="lSPrev">'+e.prevHtml+'</a><a class="lSNext">'+e.nextHtml+"</a></div>"),e.autoWidth?z.calWidth(!1)<o&&p.find(".lSAction").hide():l<=e.item&&p.find(".lSAction").hide(),p.find(".lSAction a").on("click",function(b){return b.preventDefault?b.preventDefault():b.returnValue=!1,"lSPrev"===a(this).attr("class")?g.goToPrevSlide():g.goToNextSlide(),!1}))},initialStyle:function(){var a=this;"fade"===e.mode&&(e.autoWidth=!1,e.slideEndAnimation=!1),e.auto&&(e.slideEndAnimation=!1),e.autoWidth&&(e.slideMove=1,e.item=1),e.loop&&(e.slideMove=1,e.freeMove=!1),e.onBeforeStart.call(this,g),z.chbreakpoint(),g.addClass("lightSlider").wrap('<div class="lSSlideOuter '+e.addClass+'"><div class="lSSlideWrapper"></div></div>'),p=g.parent(".lSSlideWrapper"),e.rtl===!0&&p.parent().addClass("lSrtl"),e.vertical?(p.parent().addClass("vertical"),o=e.verticalHeight,p.css("height",o+"px")):o=g.outerWidth(),h.addClass("lslide"),e.loop===!0&&"slide"===e.mode&&(z.calSW(),z.clone=function(){if(z.calWidth(!0)>o){for(var b=0,c=0,d=0;d<h.length&&(b+=parseInt(g.find(".lslide").eq(d).width())+e.slideMargin,c++,!(b>=o+e.slideMargin));d++);var f=e.autoWidth===!0?c:e.item;if(f<g.find(".clone.left").length)for(var i=0;i<g.find(".clone.left").length-f;i++)h.eq(i).remove();if(f<g.find(".clone.right").length)for(var j=h.length-1;j>h.length-1-g.find(".clone.right").length;j--)q--,h.eq(j).remove();for(var k=g.find(".clone.right").length;f>k;k++)g.find(".lslide").eq(k).clone().removeClass("lslide").addClass("clone right").appendTo(g),q++;for(var l=g.find(".lslide").length-g.find(".clone.left").length;l>g.find(".lslide").length-f;l--)g.find(".lslide").eq(l-1).clone().removeClass("lslide").addClass("clone left").prependTo(g);h=g.children()}else h.hasClass("clone")&&(g.find(".clone").remove(),a.move(g,0))},z.clone()),z.sSW=function(){l=h.length,e.rtl===!0&&e.vertical===!1&&(s="margin-left"),e.autoWidth===!1&&h.css(r,v+"px"),h.css(s,e.slideMargin+"px"),m=z.calWidth(!1),g.css(r,m+"px"),e.loop===!0&&"slide"===e.mode&&n===!1&&(q=g.find(".clone.left").length)},z.calL=function(){h=g.children(),l=h.length},this.doCss()&&p.addClass("usingCss"),z.calL(),"slide"===e.mode?(z.calSW(),z.sSW(),e.loop===!0&&(t=a.slideValue(),this.move(g,t)),e.vertical===!1&&this.setHeight(g,!1)):(this.setHeight(g,!0),g.addClass("lSFade"),this.doCss()||(h.fadeOut(0),h.eq(q).fadeIn(0))),e.loop===!0&&"slide"===e.mode?h.eq(q).addClass("active"):h.first().addClass("active")},pager:function(){var a=this;if(z.createPager=function(){w=(o-(e.thumbItem*e.thumbMargin-e.thumbMargin))/e.thumbItem;var b=p.find(".lslide"),c=p.find(".lslide").length,d=0,f="",h=0;for(d=0;c>d;d++){"slide"===e.mode&&(e.autoWidth?h+=(parseInt(b.eq(d).width())+e.slideMargin)*e.slideMove:h=d*(v+e.slideMargin)*e.slideMove);var i=b.eq(d*e.slideMove).attr("data-thumb");if(f+=e.gallery===!0?'<li style="width:100%;'+r+":"+w+"px;"+s+":"+e.thumbMargin+'px"><a href="#"><img src="'+i+'" /></a></li>':'<li><a href="#">'+(d+1)+"</a></li>","slide"===e.mode&&h>=m-o-e.slideMargin){d+=1;var j=2;e.autoWidth&&(f+='<li><a href="#">'+(d+1)+"</a></li>",j=1),j>d?(f=null,p.parent().addClass("noPager")):p.parent().removeClass("noPager");break}}var k=p.parent();k.find(".lSPager").html(f),e.gallery===!0&&(e.vertical===!0&&k.find(".lSPager").css("width",e.vThumbWidth+"px"),u=d*(e.thumbMargin+w)+.5,k.find(".lSPager").css({property:u+"px","transition-duration":e.speed+"ms"}),e.vertical===!0&&p.parent().css("padding-right",e.vThumbWidth+e.galleryMargin+"px"),k.find(".lSPager").css(r,u+"px"));var l=k.find(".lSPager").find("li");l.first().addClass("active"),l.on("click",function(){return e.loop===!0&&"slide"===e.mode?q+=l.index(this)-k.find(".lSPager").find("li.active").index():q=l.index(this),g.mode(!1),e.gallery===!0&&a.slideThumb(),!1})},e.pager){var b="lSpg";e.gallery&&(b="lSGallery"),p.after('<ul class="lSPager '+b+'"></ul>');var c=e.vertical?"margin-left":"margin-top";p.parent().find(".lSPager").css(c,e.galleryMargin+"px"),z.createPager()}setTimeout(function(){z.init()},0)},setHeight:function(a,b){var c=null,d=this;c=e.loop?a.children(".lslide ").first():a.children().first();var f=function(){var d=c.outerHeight(),e=0,f=d;b&&(d=0,e=100*f/o),a.css({height:d+"px","padding-bottom":e+"%"})};f(),c.find("img").length?c.find("img")[0].complete?(f(),x||d.auto()):c.find("img").load(function(){setTimeout(function(){f(),x||d.auto()},100)}):x||d.auto()},active:function(a,b){this.doCss()&&"fade"===e.mode&&p.addClass("on");var c=0;if(q*e.slideMove<l){a.removeClass("active"),this.doCss()||"fade"!==e.mode||b!==!1||a.fadeOut(e.speed),c=b===!0?q:q*e.slideMove;var d,f;b===!0&&(d=a.length,f=d-1,c+1>=d&&(c=f)),e.loop===!0&&"slide"===e.mode&&(c=b===!0?q-g.find(".clone.left").length:q*e.slideMove,b===!0&&(d=a.length,f=d-1,c+1===d?c=f:c+1>d&&(c=0))),this.doCss()||"fade"!==e.mode||b!==!1||a.eq(c).fadeIn(e.speed),a.eq(c).addClass("active")}else a.removeClass("active"),a.eq(a.length-1).addClass("active"),this.doCss()||"fade"!==e.mode||b!==!1||(a.fadeOut(e.speed),a.eq(c).fadeIn(e.speed))},move:function(a,b){e.rtl===!0&&(b=-b),this.doCss()?a.css(e.vertical===!0?{transform:"translate3d(0px, "+-b+"px, 0px)","-webkit-transform":"translate3d(0px, "+-b+"px, 0px)"}:{transform:"translate3d("+-b+"px, 0px, 0px)","-webkit-transform":"translate3d("+-b+"px, 0px, 0px)"}):e.vertical===!0?a.css("position","relative").animate({top:-b+"px"},e.speed,e.easing):a.css("position","relative").animate({left:-b+"px"},e.speed,e.easing);var c=p.parent().find(".lSPager").find("li");this.active(c,!0)},fade:function(){this.active(h,!1);var a=p.parent().find(".lSPager").find("li");this.active(a,!0)},slide:function(){var a=this;z.calSlide=function(){m>o&&(t=a.slideValue(),a.active(h,!1),t>m-o-e.slideMargin?t=m-o-e.slideMargin:0>t&&(t=0),a.move(g,t),e.loop===!0&&"slide"===e.mode&&(q>=l-g.find(".clone.left").length/e.slideMove&&a.resetSlide(g.find(".clone.left").length),0===q&&a.resetSlide(p.find(".lslide").length)))},z.calSlide()},resetSlide:function(a){var b=this;p.find(".lSAction a").addClass("disabled"),setTimeout(function(){q=a,p.css("transition-duration","0ms"),t=b.slideValue(),b.active(h,!1),d.move(g,t),setTimeout(function(){p.css("transition-duration",e.speed+"ms"),p.find(".lSAction a").removeClass("disabled")},50)},e.speed+100)},slideValue:function(){var a=0;if(e.autoWidth===!1)a=q*(v+e.slideMargin)*e.slideMove;else{a=0;for(var b=0;q>b;b++)a+=parseInt(h.eq(b).width())+e.slideMargin}return a},slideThumb:function(){var a;switch(e.currentPagerPosition){case"left":a=0;break;case"middle":a=o/2-w/2;break;case"right":a=o-w}var b=q-g.find(".clone.left").length,c=p.parent().find(".lSPager");"slide"===e.mode&&e.loop===!0&&(b>=c.children().length?b=0:0>b&&(b=c.children().length));var d=b*(w+e.thumbMargin)-a;d+o>u&&(d=u-o-e.thumbMargin),0>d&&(d=0),this.move(c,d)},auto:function(){e.auto&&(clearInterval(x),x=setInterval(function(){g.goToNextSlide()},e.pause))},pauseOnHover:function(){var b=this;e.auto&&e.pauseOnHover&&(p.on("mouseenter",function(){a(this).addClass("ls-hover"),g.pause(),e.auto=!0}),p.on("mouseleave",function(){a(this).removeClass("ls-hover"),p.find(".lightSlider").hasClass("lsGrabbing")||b.auto()}))},touchMove:function(a,b){if(p.css("transition-duration","0ms"),"slide"===e.mode){var c=a-b,d=t-c;if(d>=m-o-e.slideMargin)if(e.freeMove===!1)d=m-o-e.slideMargin;else{var f=m-o-e.slideMargin;d=f+(d-f)/5}else 0>d&&(e.freeMove===!1?d=0:d/=5);this.move(g,d)}},touchEnd:function(a){if(p.css("transition-duration",e.speed+"ms"),"slide"===e.mode){var b=!1,c=!0;t-=a,t>m-o-e.slideMargin?(t=m-o-e.slideMargin,e.autoWidth===!1&&(b=!0)):0>t&&(t=0);var d=function(a){var c=0;if(b||a&&(c=1),e.autoWidth)for(var d=0,f=0;f<h.length&&(d+=parseInt(h.eq(f).width())+e.slideMargin,q=f+c,!(d>=t));f++);else{var g=t/((v+e.slideMargin)*e.slideMove);q=parseInt(g)+c,t>=m-o-e.slideMargin&&g%1!==0&&q++}};a>=e.swipeThreshold?(d(!1),c=!1):a<=-e.swipeThreshold&&(d(!0),c=!1),g.mode(c),this.slideThumb()}else a>=e.swipeThreshold?g.goToPrevSlide():a<=-e.swipeThreshold&&g.goToNextSlide()},enableDrag:function(){var b=this;if(!y){var c=0,d=0,f=!1;p.find(".lightSlider").addClass("lsGrab"),p.on("mousedown",function(b){return o>m&&0!==m?!1:void("lSPrev"!==a(b.target).attr("class")&&"lSNext"!==a(b.target).attr("class")&&(c=e.vertical===!0?b.pageY:b.pageX,f=!0,b.preventDefault?b.preventDefault():b.returnValue=!1,p.scrollLeft+=1,p.scrollLeft-=1,p.find(".lightSlider").removeClass("lsGrab").addClass("lsGrabbing"),clearInterval(x)))}),a(window).on("mousemove",function(a){f&&(d=e.vertical===!0?a.pageY:a.pageX,b.touchMove(d,c))}),a(window).on("mouseup",function(g){if(f){p.find(".lightSlider").removeClass("lsGrabbing").addClass("lsGrab"),f=!1,d=e.vertical===!0?g.pageY:g.pageX;var h=d-c;Math.abs(h)>=e.swipeThreshold&&a(window).on("click.ls",function(b){b.preventDefault?b.preventDefault():b.returnValue=!1,b.stopImmediatePropagation(),b.stopPropagation(),a(window).off("click.ls")}),b.touchEnd(h)}})}},enableTouch:function(){var a=this;if(y){var b={},c={};p.on("touchstart",function(a){c=a.originalEvent.targetTouches[0],b.pageX=a.originalEvent.targetTouches[0].pageX,b.pageY=a.originalEvent.targetTouches[0].pageY,clearInterval(x)}),p.on("touchmove",function(d){if(o>m&&0!==m)return!1;var f=d.originalEvent;c=f.targetTouches[0];var g=Math.abs(c.pageX-b.pageX),h=Math.abs(c.pageY-b.pageY);e.vertical===!0?(3*h>g&&d.preventDefault(),a.touchMove(c.pageY,b.pageY)):(3*g>h&&d.preventDefault(),a.touchMove(c.pageX,b.pageX))}),p.on("touchend",function(){if(o>m&&0!==m)return!1;var d;d=e.vertical===!0?c.pageY-b.pageY:c.pageX-b.pageX,a.touchEnd(d)})}},build:function(){var b=this;b.initialStyle(),this.doCss()&&(e.enableTouch===!0&&b.enableTouch(),e.enableDrag===!0&&b.enableDrag()),a(window).on("focus",function(){b.auto()}),a(window).on("blur",function(){clearInterval(x)}),b.pager(),b.pauseOnHover(),b.controls(),b.keyPress()}},d.build(),z.init=function(){z.chbreakpoint(),e.vertical===!0?(o=e.item>1?e.verticalHeight:h.outerHeight(),p.css("height",o+"px")):o=p.outerWidth(),e.loop===!0&&"slide"===e.mode&&z.clone(),z.calL(),"slide"===e.mode&&g.removeClass("lSSlide"),"slide"===e.mode&&(z.calSW(),z.sSW()),setTimeout(function(){"slide"===e.mode&&g.addClass("lSSlide")},1e3),e.pager&&z.createPager(),e.adaptiveHeight===!0&&e.vertical===!1&&g.css("height",h.eq(q).outerHeight(!0)),e.adaptiveHeight===!1&&("slide"===e.mode?e.vertical===!1?d.setHeight(g,!1):d.auto():d.setHeight(g,!0)),e.gallery===!0&&d.slideThumb(),"slide"===e.mode&&d.slide(),e.autoWidth===!1?h.length<=e.item?p.find(".lSAction").hide():p.find(".lSAction").show():z.calWidth(!1)<o&&0!==m?p.find(".lSAction").hide():p.find(".lSAction").show()},g.goToPrevSlide=function(){if(q>0)e.onBeforePrevSlide.call(this,g,q),q--,g.mode(!1),e.gallery===!0&&d.slideThumb();else if(e.loop===!0){if(e.onBeforePrevSlide.call(this,g,q),"fade"===e.mode){var a=l-1;q=parseInt(a/e.slideMove)}g.mode(!1),e.gallery===!0&&d.slideThumb()}else e.slideEndAnimation===!0&&(g.addClass("leftEnd"),setTimeout(function(){g.removeClass("leftEnd")},400))},g.goToNextSlide=function(){var a=!0;if("slide"===e.mode){var b=d.slideValue();a=b<m-o-e.slideMargin}q*e.slideMove<l-e.slideMove&&a?(e.onBeforeNextSlide.call(this,g,q),q++,g.mode(!1),e.gallery===!0&&d.slideThumb()):e.loop===!0?(e.onBeforeNextSlide.call(this,g,q),q=0,g.mode(!1),e.gallery===!0&&d.slideThumb()):e.slideEndAnimation===!0&&(g.addClass("rightEnd"),setTimeout(function(){g.removeClass("rightEnd")},400))},g.mode=function(a){e.adaptiveHeight===!0&&e.vertical===!1&&g.css("height",h.eq(q).outerHeight(!0)),n===!1&&("slide"===e.mode?d.doCss()&&(g.addClass("lSSlide"),""!==e.speed&&p.css("transition-duration",e.speed+"ms"),""!==e.cssEasing&&p.css("transition-timing-function",e.cssEasing)):d.doCss()&&(""!==e.speed&&g.css("transition-duration",e.speed+"ms"),""!==e.cssEasing&&g.css("transition-timing-function",e.cssEasing))),a||e.onBeforeSlide.call(this,g,q),"slide"===e.mode?d.slide():d.fade(),p.hasClass("ls-hover")||d.auto(),setTimeout(function(){a||e.onAfterSlide.call(this,g,q)},e.speed),n=!0},g.play=function(){g.goToNextSlide(),e.auto=!0,d.auto()},g.pause=function(){e.auto=!1,clearInterval(x)},g.refresh=function(){z.init()},g.getCurrentSlideCount=function(){var a=q;if(e.loop){var b=p.find(".lslide").length,c=g.find(".clone.left").length;a=c-1>=q?b+(q-c):q>=b+c?q-b-c:q-c}return a+1},g.getTotalSlideCount=function(){return p.find(".lslide").length},g.goToSlide=function(a){q=e.loop?a+g.find(".clone.left").length-1:a,g.mode(!1),e.gallery===!0&&d.slideThumb()},g.destroy=function(){g.lightSlider&&(g.goToPrevSlide=function(){},g.goToNextSlide=function(){},g.mode=function(){},g.play=function(){},g.pause=function(){},g.refresh=function(){},g.getCurrentSlideCount=function(){},g.getTotalSlideCount=function(){},g.goToSlide=function(){},g.lightSlider=null,z={init:function(){}},g.parent().parent().find(".lSAction, .lSPager").remove(),g.removeClass("lightSlider lSFade lSSlide lsGrab lsGrabbing leftEnd right").removeAttr("style").unwrap().unwrap(),g.children().removeAttr("style"),h.removeClass("lslide active"),g.find(".clone").remove(),h=null,x=null,n=!1,q=0)},setTimeout(function(){e.onSliderLoad.call(this,g)},10),a(window).on("resize orientationchange",function(a){setTimeout(function(){a.preventDefault?a.preventDefault():a.returnValue=!1,z.init()},200)}),this}}(jQuery);
/*!
 * jQuery.scrollTo
 * Copyright (c) 2007-2015 Ariel Flesler - aflesler<a>gmail<d>com | http://flesler.blogspot.com
 * Licensed under MIT
 * http://flesler.blogspot.com/2007/10/jqueryscrollto.html
 * @projectDescription Lightweight, cross-browser and highly customizable animated scrolling with jQuery
 * @author Ariel Flesler
 * @version 2.1.2
 */
;(function(factory) {
	'use strict';
	if (typeof define === 'function' && define.amd) {
		// AMD
		define(['jquery'], factory);
	} else if (typeof module !== 'undefined' && module.exports) {
		// CommonJS
		module.exports = factory(require('jquery'));
	} else {
		// Global
		factory(jQuery);
	}
})(function($) {
	'use strict';

	var $scrollTo = $.scrollTo = function(target, duration, settings) {
		return $(window).scrollTo(target, duration, settings);
	};

	$scrollTo.defaults = {
		axis:'xy',
		duration: 0,
		limit:true
	};

	function isWin(elem) {
		return !elem.nodeName ||
			$.inArray(elem.nodeName.toLowerCase(), ['iframe','#document','html','body']) !== -1;
	}		

	$.fn.scrollTo = function(target, duration, settings) {
		if (typeof duration === 'object') {
			settings = duration;
			duration = 0;
		}
		if (typeof settings === 'function') {
			settings = { onAfter:settings };
		}
		if (target === 'max') {
			target = 9e9;
		}

		settings = $.extend({}, $scrollTo.defaults, settings);
		// Speed is still recognized for backwards compatibility
		duration = duration || settings.duration;
		// Make sure the settings are given right
		var queue = settings.queue && settings.axis.length > 1;
		if (queue) {
			// Let's keep the overall duration
			duration /= 2;
		}
		settings.offset = both(settings.offset);
		settings.over = both(settings.over);

		return this.each(function() {
			// Null target yields nothing, just like jQuery does
			if (target === null) return;

			var win = isWin(this),
				elem = win ? this.contentWindow || window : this,
				$elem = $(elem),
				targ = target, 
				attr = {},
				toff;

			switch (typeof targ) {
				// A number will pass the regex
				case 'number':
				case 'string':
					if (/^([+-]=?)?\d+(\.\d+)?(px|%)?$/.test(targ)) {
						targ = both(targ);
						// We are done
						break;
					}
					// Relative/Absolute selector
					targ = win ? $(targ) : $(targ, elem);
					/* falls through */
				case 'object':
					if (targ.length === 0) return;
					// DOMElement / jQuery
					if (targ.is || targ.style) {
						// Get the real position of the target
						toff = (targ = $(targ)).offset();
					}
			}

			var offset = $.isFunction(settings.offset) && settings.offset(elem, targ) || settings.offset;

			$.each(settings.axis.split(''), function(i, axis) {
				var Pos	= axis === 'x' ? 'Left' : 'Top',
					pos = Pos.toLowerCase(),
					key = 'scroll' + Pos,
					prev = $elem[key](),
					max = $scrollTo.max(elem, axis);

				if (toff) {// jQuery / DOMElement
					attr[key] = toff[pos] + (win ? 0 : prev - $elem.offset()[pos]);

					// If it's a dom element, reduce the margin
					if (settings.margin) {
						attr[key] -= parseInt(targ.css('margin'+Pos), 10) || 0;
						attr[key] -= parseInt(targ.css('border'+Pos+'Width'), 10) || 0;
					}

					attr[key] += offset[pos] || 0;

					if (settings.over[pos]) {
						// Scroll to a fraction of its width/height
						attr[key] += targ[axis === 'x'?'width':'height']() * settings.over[pos];
					}
				} else {
					var val = targ[pos];
					// Handle percentage values
					attr[key] = val.slice && val.slice(-1) === '%' ?
						parseFloat(val) / 100 * max
						: val;
				}

				// Number or 'number'
				if (settings.limit && /^\d+$/.test(attr[key])) {
					// Check the limits
					attr[key] = attr[key] <= 0 ? 0 : Math.min(attr[key], max);
				}

				// Don't waste time animating, if there's no need.
				if (!i && settings.axis.length > 1) {
					if (prev === attr[key]) {
						// No animation needed
						attr = {};
					} else if (queue) {
						// Intermediate animation
						animate(settings.onAfterFirst);
						// Don't animate this axis again in the next iteration.
						attr = {};
					}
				}
			});

			animate(settings.onAfter);

			function animate(callback) {
				var opts = $.extend({}, settings, {
					// The queue setting conflicts with animate()
					// Force it to always be true
					queue: true,
					duration: duration,
					complete: callback && function() {
						callback.call(elem, targ, settings);
					}
				});
				$elem.animate(attr, opts);
			}
		});
	};

	// Max scrolling position, works on quirks mode
	// It only fails (not too badly) on IE, quirks mode.
	$scrollTo.max = function(elem, axis) {
		var Dim = axis === 'x' ? 'Width' : 'Height',
			scroll = 'scroll'+Dim;

		if (!isWin(elem))
			return elem[scroll] - $(elem)[Dim.toLowerCase()]();

		var size = 'client' + Dim,
			doc = elem.ownerDocument || elem.document,
			html = doc.documentElement,
			body = doc.body;

		return Math.max(html[scroll], body[scroll]) - Math.min(html[size], body[size]);
	};

	function both(val) {
		return $.isFunction(val) || $.isPlainObject(val) ? val : { top:val, left:val };
	}

	// Add special hooks so that window scroll properties can be animated
	$.Tween.propHooks.scrollLeft = 
	$.Tween.propHooks.scrollTop = {
		get: function(t) {
			return $(t.elem)[t.prop]();
		},
		set: function(t) {
			var curr = this.get(t);
			// If interrupt is true and user scrolled, stop animating
			if (t.options.interrupt && t._last && t._last !== curr) {
				return $(t.elem).stop();
			}
			var next = Math.round(t.now);
			// Don't waste CPU
			// Browsers don't render floating point scroll
			if (curr !== next) {
				$(t.elem)[t.prop](next);
				t._last = this.get(t);
			}
		}
	};

	// AMD requirement
	return $scrollTo;
});

/**
 * EvEmitter v1.0.2
 * Lil' event emitter
 * MIT License
 */

/* jshint unused: true, undef: true, strict: true */

( function( global, factory ) {
  // universal module definition
  /* jshint strict: false */ /* globals define, module */
  if ( typeof define == 'function' && define.amd ) {
    // AMD - RequireJS
    define( factory );
  } else if ( typeof module == 'object' && module.exports ) {
    // CommonJS - Browserify, Webpack
    module.exports = factory();
  } else {
    // Browser globals
    global.EvEmitter = factory();
  }

}( this, function() {

"use strict";

function EvEmitter() {}

var proto = EvEmitter.prototype;

proto.on = function( eventName, listener ) {
  if ( !eventName || !listener ) {
    return;
  }
  // set events hash
  var events = this._events = this._events || {};
  // set listeners array
  var listeners = events[ eventName ] = events[ eventName ] || [];
  // only add once
  if ( listeners.indexOf( listener ) == -1 ) {
    listeners.push( listener );
  }

  return this;
};

proto.once = function( eventName, listener ) {
  if ( !eventName || !listener ) {
    return;
  }
  // add event
  this.on( eventName, listener );
  // set once flag
  // set onceEvents hash
  var onceEvents = this._onceEvents = this._onceEvents || {};
  // set onceListeners object
  var onceListeners = onceEvents[ eventName ] = onceEvents[ eventName ] || {};
  // set flag
  onceListeners[ listener ] = true;

  return this;
};

proto.off = function( eventName, listener ) {
  var listeners = this._events && this._events[ eventName ];
  if ( !listeners || !listeners.length ) {
    return;
  }
  var index = listeners.indexOf( listener );
  if ( index != -1 ) {
    listeners.splice( index, 1 );
  }

  return this;
};

proto.emitEvent = function( eventName, args ) {
  var listeners = this._events && this._events[ eventName ];
  if ( !listeners || !listeners.length ) {
    return;
  }
  var i = 0;
  var listener = listeners[i];
  args = args || [];
  // once stuff
  var onceListeners = this._onceEvents && this._onceEvents[ eventName ];

  while ( listener ) {
    var isOnce = onceListeners && onceListeners[ listener ];
    if ( isOnce ) {
      // remove listener
      // remove before trigger to prevent recursion
      this.off( eventName, listener );
      // unset once flag
      delete onceListeners[ listener ];
    }
    // trigger listener
    listener.apply( this, args );
    // get next listener
    i += isOnce ? 0 : 1;
    listener = listeners[i];
  }

  return this;
};

return EvEmitter;

}));

/*!
 * imagesLoaded v4.1.0
 * JavaScript is all like "You images are done yet or what?"
 * MIT License
 */

( function( window, factory ) { 'use strict';
  // universal module definition

  /*global define: false, module: false, require: false */

  if ( typeof define == 'function' && define.amd ) {
    // AMD
    define( [
      'ev-emitter/ev-emitter'
    ], function( EvEmitter ) {
      return factory( window, EvEmitter );
    });
  } else if ( typeof module == 'object' && module.exports ) {
    // CommonJS
    module.exports = factory(
      window,
      require('ev-emitter')
    );
  } else {
    // browser global
    window.imagesLoaded = factory(
      window,
      window.EvEmitter
    );
  }

})( window,

// --------------------------  factory -------------------------- //

function factory( window, EvEmitter ) {

'use strict';

var $ = window.jQuery;
var console = window.console;

// -------------------------- helpers -------------------------- //

// extend objects
function extend( a, b ) {
  for ( var prop in b ) {
    a[ prop ] = b[ prop ];
  }
  return a;
}

// turn element or nodeList into an array
function makeArray( obj ) {
  var ary = [];
  if ( Array.isArray( obj ) ) {
    // use object if already an array
    ary = obj;
  } else if ( typeof obj.length == 'number' ) {
    // convert nodeList to array
    for ( var i=0; i < obj.length; i++ ) {
      ary.push( obj[i] );
    }
  } else {
    // array of single index
    ary.push( obj );
  }
  return ary;
}

// -------------------------- imagesLoaded -------------------------- //

/**
 * @param {Array, Element, NodeList, String} elem
 * @param {Object or Function} options - if function, use as callback
 * @param {Function} onAlways - callback function
 */
function ImagesLoaded( elem, options, onAlways ) {
  // coerce ImagesLoaded() without new, to be new ImagesLoaded()
  if ( !( this instanceof ImagesLoaded ) ) {
    return new ImagesLoaded( elem, options, onAlways );
  }
  // use elem as selector string
  if ( typeof elem == 'string' ) {
    elem = document.querySelectorAll( elem );
  }

  this.elements = makeArray( elem );
  this.options = extend( {}, this.options );

  if ( typeof options == 'function' ) {
    onAlways = options;
  } else {
    extend( this.options, options );
  }

  if ( onAlways ) {
    this.on( 'always', onAlways );
  }

  this.getImages();

  if ( $ ) {
    // add jQuery Deferred object
    this.jqDeferred = new $.Deferred();
  }

  // HACK check async to allow time to bind listeners
  setTimeout( function() {
    this.check();
  }.bind( this ));
}

ImagesLoaded.prototype = Object.create( EvEmitter.prototype );

ImagesLoaded.prototype.options = {};

ImagesLoaded.prototype.getImages = function() {
  this.images = [];

  // filter & find items if we have an item selector
  this.elements.forEach( this.addElementImages, this );
};

/**
 * @param {Node} element
 */
ImagesLoaded.prototype.addElementImages = function( elem ) {
  // filter siblings
  if ( elem.nodeName == 'IMG' ) {
    this.addImage( elem );
  }
  // get background image on element
  if ( this.options.background === true ) {
    this.addElementBackgroundImages( elem );
  }

  // find children
  // no non-element nodes, #143
  var nodeType = elem.nodeType;
  if ( !nodeType || !elementNodeTypes[ nodeType ] ) {
    return;
  }
  var childImgs = elem.querySelectorAll('img');
  // concat childElems to filterFound array
  for ( var i=0; i < childImgs.length; i++ ) {
    var img = childImgs[i];
    this.addImage( img );
  }

  // get child background images
  if ( typeof this.options.background == 'string' ) {
    var children = elem.querySelectorAll( this.options.background );
    for ( i=0; i < children.length; i++ ) {
      var child = children[i];
      this.addElementBackgroundImages( child );
    }
  }
};

var elementNodeTypes = {
  1: true,
  9: true,
  11: true
};

ImagesLoaded.prototype.addElementBackgroundImages = function( elem ) {
  var style = getComputedStyle( elem );
  if ( !style ) {
    // Firefox returns null if in a hidden iframe https://bugzil.la/548397
    return;
  }
  // get url inside url("...")
  var reURL = /url\((['"])?(.*?)\1\)/gi;
  var matches = reURL.exec( style.backgroundImage );
  while ( matches !== null ) {
    var url = matches && matches[2];
    if ( url ) {
      this.addBackground( url, elem );
    }
    matches = reURL.exec( style.backgroundImage );
  }
};

/**
 * @param {Image} img
 */
ImagesLoaded.prototype.addImage = function( img ) {
  var loadingImage = new LoadingImage( img );
  this.images.push( loadingImage );
};

ImagesLoaded.prototype.addBackground = function( url, elem ) {
  var background = new Background( url, elem );
  this.images.push( background );
};

ImagesLoaded.prototype.check = function() {
  var _this = this;
  this.progressedCount = 0;
  this.hasAnyBroken = false;
  // complete if no images
  if ( !this.images.length ) {
    this.complete();
    return;
  }

  function onProgress( image, elem, message ) {
    // HACK - Chrome triggers event before object properties have changed. #83
    setTimeout( function() {
      _this.progress( image, elem, message );
    });
  }

  this.images.forEach( function( loadingImage ) {
    loadingImage.once( 'progress', onProgress );
    loadingImage.check();
  });
};

ImagesLoaded.prototype.progress = function( image, elem, message ) {
  this.progressedCount++;
  this.hasAnyBroken = this.hasAnyBroken || !image.isLoaded;
  // progress event
  this.emitEvent( 'progress', [ this, image, elem ] );
  if ( this.jqDeferred && this.jqDeferred.notify ) {
    this.jqDeferred.notify( this, image );
  }
  // check if completed
  if ( this.progressedCount == this.images.length ) {
    this.complete();
  }

  if ( this.options.debug && console ) {
    console.log( 'progress: ' + message, image, elem );
  }
};

ImagesLoaded.prototype.complete = function() {
  var eventName = this.hasAnyBroken ? 'fail' : 'done';
  this.isComplete = true;
  this.emitEvent( eventName, [ this ] );
  this.emitEvent( 'always', [ this ] );
  if ( this.jqDeferred ) {
    var jqMethod = this.hasAnyBroken ? 'reject' : 'resolve';
    this.jqDeferred[ jqMethod ]( this );
  }
};

// --------------------------  -------------------------- //

function LoadingImage( img ) {
  this.img = img;
}

LoadingImage.prototype = Object.create( EvEmitter.prototype );

LoadingImage.prototype.check = function() {
  // If complete is true and browser supports natural sizes,
  // try to check for image status manually.
  var isComplete = this.getIsImageComplete();
  if ( isComplete ) {
    // report based on naturalWidth
    this.confirm( this.img.naturalWidth !== 0, 'naturalWidth' );
    return;
  }

  // If none of the checks above matched, simulate loading on detached element.
  this.proxyImage = new Image();
  this.proxyImage.addEventListener( 'load', this );
  this.proxyImage.addEventListener( 'error', this );
  // bind to image as well for Firefox. #191
  this.img.addEventListener( 'load', this );
  this.img.addEventListener( 'error', this );
  this.proxyImage.src = this.img.src;
};

LoadingImage.prototype.getIsImageComplete = function() {
  return this.img.complete && this.img.naturalWidth !== undefined;
};

LoadingImage.prototype.confirm = function( isLoaded, message ) {
  this.isLoaded = isLoaded;
  this.emitEvent( 'progress', [ this, this.img, message ] );
};

// ----- events ----- //

// trigger specified handler for event type
LoadingImage.prototype.handleEvent = function( event ) {
  var method = 'on' + event.type;
  if ( this[ method ] ) {
    this[ method ]( event );
  }
};

LoadingImage.prototype.onload = function() {
  this.confirm( true, 'onload' );
  this.unbindEvents();
};

LoadingImage.prototype.onerror = function() {
  this.confirm( false, 'onerror' );
  this.unbindEvents();
};

LoadingImage.prototype.unbindEvents = function() {
  this.proxyImage.removeEventListener( 'load', this );
  this.proxyImage.removeEventListener( 'error', this );
  this.img.removeEventListener( 'load', this );
  this.img.removeEventListener( 'error', this );
};

// -------------------------- Background -------------------------- //

function Background( url, element ) {
  this.url = url;
  this.element = element;
  this.img = new Image();
}

// inherit LoadingImage prototype
Background.prototype = Object.create( LoadingImage.prototype );

Background.prototype.check = function() {
  this.img.addEventListener( 'load', this );
  this.img.addEventListener( 'error', this );
  this.img.src = this.url;
  // check if image is already complete
  var isComplete = this.getIsImageComplete();
  if ( isComplete ) {
    this.confirm( this.img.naturalWidth !== 0, 'naturalWidth' );
    this.unbindEvents();
  }
};

Background.prototype.unbindEvents = function() {
  this.img.removeEventListener( 'load', this );
  this.img.removeEventListener( 'error', this );
};

Background.prototype.confirm = function( isLoaded, message ) {
  this.isLoaded = isLoaded;
  this.emitEvent( 'progress', [ this, this.element, message ] );
};

// -------------------------- jQuery -------------------------- //

ImagesLoaded.makeJQueryPlugin = function( jQuery ) {
  jQuery = jQuery || window.jQuery;
  if ( !jQuery ) {
    return;
  }
  // set local variable
  $ = jQuery;
  // $().imagesLoaded()
  $.fn.imagesLoaded = function( options, callback ) {
    var instance = new ImagesLoaded( this, options, callback );
    return instance.jqDeferred.promise( $(this) );
  };
};
// try making plugin
ImagesLoaded.makeJQueryPlugin();

// --------------------------  -------------------------- //

return ImagesLoaded;

});
