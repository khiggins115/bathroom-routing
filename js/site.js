
//my access token, from mapbox studio
L.mapbox.accessToken = 'pk.eyJ1Ijoia2hpZ2dpbnMxMTUiLCJhIjoiY2ltcW9pZXZkMDBua3ZsbTRieXh1NmdkdSJ9.CDeDgVkdUyZS3nkyJWYAXg';

//var map to hold coords, zoom level and basemap styling (mapbox-light)
var map = L.mapbox.map('map', 'mapbox.light',{ zoomControl: false })
    .setView([30.62,-96.34], 14);
new L.Control.Zoom({ position: 'bottomleft' }).addTo(map);

var marker = L.marker(new L.LatLng(30.62,-96.34), {
    icon: L.mapbox.marker.icon({
        "marker-color": "#500000",
        "title": "You need to pee",
        "marker-symbol": "pitch",
        "marker-size": "large"
    }),
    draggable: true,
    zIndexOffset:999
});

//global variable to hold current position
var currentPosition;
var currentRadius = 1;

//geolocation
function getLocation() {
    if (navigator.geolocation) {
        //navigator.geolocation gives web content to a device's location, from Mozilla MDN
        //https://developer.mozilla.org/en-US/docs/Web/API/Navigator/geolocation
        navigator.geolocation.getCurrentPosition(showPosition);
    }
}

//use function for this bc marker is also draggable....only updated if user chooses 'findme' functionality
function showPosition(position) {
    $('#findme').show(); //jquery,
    currentPosition=[position.coords.latitude, position.coords.longitude];
}


function pointBuffer (pt, radius, units, resolution) {
  var ring = []
  var resMultiple = 360/resolution;
  for(var i  = 0; i < resolution; i++) {
    var spoke = turf.destination(pt, radius, i*resMultiple, units);
    ring.push(spoke.geometry.coordinates);
  }
  if((ring[0][0] !== ring[ring.length-1][0]) && (ring[0][1] != ring[ring.length-1][1])) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  return turf.polygon([ring])
}

$.get('data/map.geojson', function(data){
    $('.blocker').remove();
    $('#topbar').show();

    var fc = (data);
    var fc = JSON.parse(data);

    //find me functionality
    $('#findme').on('click', function(){
        marker.setLatLng(currentPosition);
        map.setView(currentPosition, 14);
        updateVenues();
    });

    //click-move functionality
    map.on('click',function(e){
        marker.setLatLng([e.latlng.lat, e.latlng.lng]);
        map.setView([e.latlng.lat, e.latlng.lng],14);
        updateVenues();
    });


    function showMap(err, data) {
        map.setView([data.latlng[0], data.latlng[1]], 13);
        marker.setLatLng([data.latlng[0], data.latlng[1]]);
        updateVenues();
    }

    //mousewheel functionality (adjust radius)

    $('.leaflet-marker-draggable').on('mousewheel',function(event){
        var wheelDelta= event.originalEvent.wheelDeltaY;
        if (currentRadius-wheelDelta*0.001>=0.5 && currentRadius-wheelDelta*0.001<=2){
            currentRadius=currentRadius-wheelDelta*0.001;
            updateVenues();
            var distancePhrase;
            switch (parseFloat(currentRadius.toFixed(2))) {
                case 0.50:
                    distancePhrase = 'a half mile'
                    break;
                case 1.00:
                    distancePhrase = 'a mile'
                    break;
                case 2.00:
                    distancePhrase = 'two miles'
                    break;
                default:
                    distancePhrase = currentRadius.toFixed(2)+' miles'
                    break;
            }
            $('#distance').html(distancePhrase);
        }

        event.stopPropagation();
        return false;
    });

    // get position, get radius, draw buffer, find within, calculate distances, find nearest, add to map
    function updateVenues(){
        $('path').remove();
        $('.leaflet-marker-pane *').not(':first').remove();
        var position=marker.getLatLng();
        var point=turf.point(position.lng, position.lat);

        //draw buffer
        var bufferLayer = L.mapbox.featureLayer().addTo(map);
            var buffer = pointBuffer(point, currentRadius, 'miles', 120);
            buffer.properties = {
                "fill": "#500000",
                "fill-opacity":0.05,
                "stroke": "#500000",
                "stroke-width": 2,
                "stroke-opacity": 0.5
            };

        bufferLayer.setGeoJSON(buffer);

        var within = turf.featurecollection(fc.features.filter(function(shop){
            if (turf.distance(shop, point, 'miles') <= currentRadius) return true;
        }));
        $('#milecount').html(within.features.length);
        function mileConvert(miles){
            if (miles<=0.25){
                return (miles*5280).toFixed(0)+' ft'
            } else {
                return miles.toFixed(2) +' mi'
            }
        }
/*
        function checkPhone(phone){
            if(phone!==null && phone!=='null'){
                return '<br>☎ '+phone
            } else {
                return ''}
        }
*/
        within.features.forEach(function(feature){
            var distance = parseFloat(turf.distance(point, feature, 'miles'));
            feature.properties["marker-color"] = "#6E6E6E";
            feature.properties["title"] = '<span>'+mileConvert(distance)+'</span><br>'+feature.properties["building_name"]+'<br>'+"Public: "+feature.properties["public"]+'<br>'+"Category: "+feature.properties["category"]+'<br><strong>Click for walking route</strong>';
            feature.properties["marker-size"] = "small";
            feature.properties["marker-symbol"] = "circle";
        })

        var nearest = turf.nearest(point, fc);
        var nearestdist = parseFloat(turf.distance(point, nearest, 'miles'));

            nearest.properties["marker-color"] = "#500000";
            nearest.properties["title"] = '<span>'+mileConvert(nearestdist)+' (nearest)</span><br>'+nearest.properties["building_name"]+'<br>'+"Public:"+nearest.properties["public"]+'<br>'+"Category:"+nearest.properties["category"]+'<br><strong>Click for walking route</strong>';
            nearest.properties["marker-size"] = "medium";
            nearest.properties["marker-symbol"] = "circle";

        var nearest_fc = L.mapbox.featureLayer().setGeoJSON(turf.featurecollection([within, nearest])).addTo(map);

        // hover tooltips and click to zoom/route functionality
        nearest_fc
        .on('mouseover', function(e) {
            e.layer.openPopup();
        })
        .on('mouseout', function(e) {
            e.layer.closePopup();
        })
        .on('click', function(e){

            // assemble directions URL based on position of user and selected cafe
            var startEnd= position.lng+','+position.lat+';'+e.latlng.lng+','+e.latlng.lat;
            var directionsAPI = 'https://api.tiles.mapbox.com/v4/directions/mapbox.walking/'+startEnd+'.json?access_token='+L.mapbox.accessToken;

            // query for directions and draw the path
            $.get(directionsAPI, function(data){
                var coords= data.routes[0].geometry.coordinates;
                coords.unshift([position.lng, position.lat]);
                coords.push([e.latlng.lng, e.latlng.lat]);
                var path = turf.linestring(coords, {
                    "stroke": "#500000",
                    "stroke-width": 4,
                    "opacity":1
                });

                $('.distance-icon').remove();
                map.fitBounds(map.featureLayer.setGeoJSON(path).getBounds());
                window.setTimeout(function(){$('path').css('stroke-dashoffset',0)},400);
                var duration= parseInt((data.routes[0].duration)/60);
                if (duration<100){
                    L.marker([coords[parseInt(coords.length*0.5)][1],coords[parseInt(coords.length*0.5)][0]],{
                        icon: L.divIcon({
                            className: 'distance-icon',
                            html: '<strong style="color:#500000">'+duration+'</strong> <span class="micro">min</span>',
                            iconSize: [45, 23]
                        })})
                    .addTo(map);
                }
            })
        });
    }
    marker.on('drag', function(){updateVenues()});
    updateVenues();
});

getLocation();
marker.addTo(map);
