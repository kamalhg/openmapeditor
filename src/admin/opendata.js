/*jshint strict:false */
/*global angular:false */
angular.module('myApp').config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/opendata', {
        controller: 'OpendataController',
        templateUrl: 'partials/opendata.html'
    });
}]);
angular.module('myApp.controllers').controller(
    'OpendataController',
    ['$scope', '$http', 'messagesService', 'Restangular', 'osmService', 'leafletData',
    function($scope, $http, messagesService, Restangular, osmService, leafletData){
        Restangular.all('layers').getList().then(function (data) {
            $scope.opendataLayers = data;
        });
        $scope.previousConfiguration = {};
        $scope._ = _; // inject underscorejs for expr
        $scope.capitalize = function(string) {
            return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
        };
        var phoneRegExp = new RegExp('^[0-9]{1}');
        $scope.i18nPhone = function(string){
            if (string.indexOf('+33') !== 0){
                return string.replace(phoneRegExp, '+33 ');
            }
            return string;
        };
        $scope.traverse = function(obj, path){
            var succeed = true;
            if (typeof path !== 'object'){
                path = [path];
            }
            for (var j = 0; j < path.length; j++) {
                var splited = path[j].split('.');
                var traversed = obj;
                for (var i = 0; i < splited.length; i++) {
                    if (traversed.hasOwnProperty(splited[i])){
                        traversed = traversed[splited[i]];
                        succeed = true;
                    }else{
                        succeed = false;
                        break;
                    }
                }
                if (succeed){
                    if (traversed){
                        return traversed;
                    }
                }
            }
        };
        $scope.currentMap = {lat: 47.2383, lng: -1.5603, zoom: 11};
        $scope.markers = {
            Localisation: {
                id: undefined,
                lat: 47.2383,
                lng: -1.5603,
                message: 'Déplacer ce marker sur la localisation souhaitée.',
                focus: true,
                draggable: true
            }
        };
        $scope.getFeatureID = function(feature){
            if (!feature){
                return;
            }
            return $scope.traverse(feature, $scope.featureID);
        };
        $scope.getFeatureName = function(feature){
            if (!feature){
                return;
            }
            var name = $scope.traverse(feature, $scope.featureName);
            if (!name){
                //try OSM:
                return feature.properties.name;
            }
            return name;
        };
        $scope.hidden = [];
        $scope.geojson = '/geojson/culture-bibliotheque.geo.json';
        $scope.featureName = 'properties.geo.name';
        $scope.featureID = 'properties._IDOBJ';
        $scope.featureAddressExp = 'currentFeature.properties.ADR_1';
        $scope.reloadFeatures = function(){
            $http.get($scope.geojson).then(
                function(data){
                    $scope.features = data.data.features;
                    if (!$scope.previousConfiguration[$scope.geojson]){
                        $scope.previousConfiguration[$scope.geojson] = {url: $scope.geojson};
                    }
                    $scope.previousConfiguration[$scope.geojson].featureID = $scope.featureID;
                    $scope.previousConfiguration[$scope.geojson].featureName = $scope.featureName;
                    $scope.previousConfiguration[$scope.geojson].featureAddressExp = $scope.featureAddressExp;
                });
        };

        $scope.shouldDisplay = function(key, value){
            if (value === undefined || value === null || value === ''){
                return false;
            }
            for (var i = 0; i < $scope.hidden.length; i++) {
                if (key === $scope.hidden[i]){
                    return false;
                }
            }
            return true;
        };
        $scope.hide = function(key){
            $scope.hidden.push(key);
        };
        $scope.setCurrentFeature = function(feature){
            leafletData.getMap().then(function(map){
                $scope.currentFeature = feature;
                $scope.markers.Localisation.lng = feature.geometry.coordinates[0];
                $scope.markers.Localisation.lat = feature.geometry.coordinates[1];
                $scope.markers.Localisation.message = $scope.getFeatureName(feature);
                map.setView(
                    L.latLng(
                        feature.geometry.coordinates[1],
                        feature.geometry.coordinates[0]
                    ),
                    17
                );
                $scope.currentAddress = $scope.$eval($scope.featureAddressExp);
                var b = map.getBounds();
                var obox = '' + b.getSouth() + ',' + b.getWest() + ',' + b.getNorth() + ',' + b.getEast();
                var query = 'node('+ obox+')' + $scope.overpassquery + ';out;';

                osmService.overpass(query).then(function(nodes){
                    $scope.nodes = osmService.getNodesInJSON(nodes);
                    if ($scope.nodes.length === 1){
                        $scope.setCurrentNode($scope.nodes[0]);
                    }
                });
                $scope.currentFeature.osm = {};
                for (var property in $scope.osmtags) {
                    if ($scope.osmtags.hasOwnProperty(property)) {
                        $scope.currentFeature.osm[property] = $scope.getCurrentNodeValueFromFeature(property);
                    }
                }
            });
        };
        $scope.$watch('geojson', function(){
            $scope.reloadFeatures();
        });
        $scope.$watch('featureID', function(){
            $scope.reloadFeatures();
        });

        $scope.username = '';
        $scope.password = '';
        $scope.overpassquery = '[amenity=library]';
        $scope.nodes = [];
/*        $scope.login = function(){
            $scope.Authorization = osmService.getAuthorization($scope.username, $scope.password);
            osmService.get('/api/capabilities').then(function(capabilities){
                $scope.capabilities = capabilities;
            });
        };
        $scope.logout = function(){
            osmService.clearCredentials();
        };*/
        $scope.osmtags = {
            amenity: "'library'",
            'addr:city': 'capitalize(currentFeature.properties.COMMUNE)',
            phone: 'i18nPhone(currentFeature.properties.TELEPHONE)',
            postal_code: 'currentFeature.properties.CODE_POSTAL',
            name: 'currentFeature.properties.geo.name'
        };
        $scope.setCurrentNode = function(node){
            $scope.currentNode = node;
            $scope.updatedNode = angular.copy(node);
            for (var property in $scope.osmtags) {
                if ($scope.osmtags.hasOwnProperty(property)) {
                    $scope.updatedNode.properties[property] = $scope.getCurrentNodeValueFromFeature(property);
                }
            }
        };
        $scope.addOSMTag = function(){
            $scope.osmtags[$scope.newOSMKey] = $scope.newOSMValueExpr;
            $scope.newOSMKey = '';
            $scope.newOSMValueExpr = '';
        };
        $scope.getCurrentNodeValueFromFeature = function(key){
            if ($scope.osmtags[key] !== undefined){
                return $scope.$eval($scope.osmtags[key]);
            }
        };
        $scope.deleteOSMTag = function(index){
            delete $scope.osmtags[index];
        };
        $scope.getTableRowClass = function(key, value){
            if (key === 'id'){
                return 'hidden';
            }
            if (value === '' || value === undefined){
                if ($scope.currentNode.properties[key] === value){
                    return;
                }
                return 'danger';
            }
            if ($scope.currentNode.properties[key] === undefined){
                return 'success';
            }
            if ($scope.currentNode.properties[key] !== value){
                return 'warning';
            }
        };

    }]
);