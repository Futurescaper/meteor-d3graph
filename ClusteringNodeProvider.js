﻿ClusteringNodeProvider = function (graph) {

    var _nodelib = new d3nodes(graph);
    this.getAllNodes = function () { return _nodelib.getNodes(); }
    this.getVisNodes = function () {
        var result = [];
        var clusterPlaceholdersToAdd = {};

        _(_nodelib.getNodes()).each(function (n) {
            if (n.clusterId)
                clusterPlaceholdersToAdd[n.clusterId] = clusters[n.clusterId].placeholderNode;
            else
                result.push(n);
        });

        _(clusterPlaceholdersToAdd).each(function (value, key) { result.push(value); });

        return result;
    }

    var _linklib = new d3links(graph, _nodelib);
    this.getAllLinks = function () { return _linklib.getLinks(); }
    this.getVisLinks = function () {
        var result = [];

        _(_linklib.getLinks()).each(function (l) {

            if (l.source.clusterId || l.target.clusterId) {
                if (l.source.clusterId === l.target.clusterId) return;  // Link within same cluster, ignore it.

                var sourceNode = l.source.clusterId ? clusters[l.source.clusterId].placeholderNode : l.source;
                var targetNode = l.target.clusterId ? clusters[l.target.clusterId].placeholderNode : l.target;

                var placeholderLinksToSearch = l.source.clusterId ? clusters[l.source.clusterId].outgoingPlaceholderLinks : clusters[l.target.clusterId].incomingPlaceholderLinks;
                var placeholderLink = _(placeholderLinksToSearch).find(function (l) { return l.source === sourceNode && l.target === targetNode });
                result.push(placeholderLink);
            }
            else
                result.push(l);
        });

        return result;
    }

    var clusters = {};
    this.getVisClusters = function () { return []; /*return _.values(clusters);*/ }

    function getOrCreateCluster(clusterId, settings) {
        if(!clusters.hasOwnProperty(clusterId)) {
            var nodes = [];

            function makeHull() {
                var nodePoints = [];

                _(nodes).each(function (n) {
                    var offset = n.radius || 5;
                    var x = n.x || 0;
                    var y = n.y || 0;
                    nodePoints.push([x - offset, y - offset]);
                    nodePoints.push([x - offset, y + offset]);
                    nodePoints.push([x + offset, y - offset]);
                    nodePoints.push([x + offset, y + offset]);
                });

                return d3.geom.hull(nodePoints);
            }

            var cluster = {
                id: clusterId,
                collapsed: true,
                nodes: nodes,
                makeHull: makeHull,
                incomingPlaceholderLinks: [],
                outgoingPlaceholderLinks: []
            };
            clusters[clusterId] = cluster;

            var placeholderNode = {
                id: "cluster-" + clusterId,
                title: clusterId,
                value: { size: 0, color: 0 },
                ratio: { size: 0, color: 0 },
                jenks: { size: 0, color: 0 },
                data: [],
                radius: 0, // graph.settings.maxRadius,
                _radius: 0, // graph.settings.maxRadius,
                visible: true,
                isClusterPlaceholder: true,
                clusterId: clusterId,
                cluster: cluster
            };

            cluster.placeholderNode = placeholderNode;
        }

        if (settings) {
            clusters[clusterId].placeholderNode.title = settings.title;
            clusters[clusterId].placeholderNode.value.color = settings.color;
        }

        return clusters[clusterId];
    }

    this.setCluster = function (clusterId, title, color) {
        var cluster = getOrCreateCluster(clusterId, { title: title, color: color });
    }

    this.updateClusters = function () {
        // Remove cluster placeholder stuff and clear clusters
        var oldClusters = _.clone(clusters);
        clusters = {};

        // And rebuild them
        _(_nodelib.getNodes()).each(function (node) {
            if (node.clusterId) {

                var settings;
                if(oldClusters.hasOwnProperty(node.clusterId)) {
                    settings = {
                        title: oldClusters[node.clusterId].placeholderNode.title,
                        color: oldClusters[node.clusterId].placeholderNode.value.color
                    };
                }

                var cluster = getOrCreateCluster(node.clusterId, settings);
                cluster.nodes.push(node);
                cluster.placeholderNode.radius += node.radius;
                cluster.placeholderNode._radius += node._radius;
                cluster.placeholderNode.value.size += node.value.size;
            }
        });

        this.calculateNodes();

        _(_linklib.getLinks()).each(function (link) {
            if (link.source.clusterId) {
                if (link.target.clusterId && link.source.clusterId === link.target.clusterId) {
                    // Same cluster. Don't create a placeholder
                    return;
                }

                var placeholderLink = {
                    source: clusters[link.source.clusterId].placeholderNode,
                    target: link.target,
                    normalized: link.normalized,
                    isClusterPlaceholder: true
                };
                clusters[link.source.clusterId].outgoingPlaceholderLinks.push(placeholderLink);

                if (link.target.clusterId) {
                    placeholderLink.target = clusters[link.target.clusterId].placeholderNode;
                    clusters[link.target.clusterId].incomingPlaceholderLinks.push(placeholderLink);
                }

                placeholderLink.id = placeholderLink.source.id + "->" + placeholderLink.target.id;
            }
            else if (link.target.clusterId) {
                var placeholderLink = {
                    id: link.source.id + "->" + clusters[link.target.clusterId].placeholderNode.id,
                    source: link.source,
                    target: clusters[link.target.clusterId].placeholderNode,
                    normalized: link.normalized,
                    isClusterPlaceholder: true
                };

                clusters[link.target.clusterId].incomingPlaceholderLinks.push(placeholderLink);
            }
        });
    }

    this.addNode = function (settings) {
        var node = _nodelib.addNode(settings);
        this.updateClusters();
        return node;
    };

    this.removeNode = function (id, tag, forceRemove) {
        var node = _nodelib.removeNode(id, tag, forceRemove);
        this.updateClusters();
        return node;
    };

    this.addLink = function (options) {
        var link = _linklib.addLink(options);
        this.updateClusters();
        return link;
    };

    this.removeLink = function (from, to) {
        var link =  _linklib.removeLink(from, to);
        this.updateClusters();
        return link;
    };

    this.getCluster = function (clusterId) {
        return clusters[clusterId];
    }

    this.getNodeColor = function (d) {  return _nodelib.getNodeColor(d); }

    this.getNodeBorderColor = function (d) { return _nodelib.getNodeBorderColor(d); }
    this.getNodeRadius = function (d) { return _nodelib.getNodeRadius(d); }

    this.getNodeTooltip = function (d) { return _nodelib.getNodeTooltip(d); }

    this.onNodeMouseover = function (d) {
        if(d.isClusterPlaceholder) return;

        return _nodelib.onNodeMouseover(d);
    }

    this.onNodeMouseout = function (d) {
        if(d.isClusterPlaceholder) return;

        return _nodelib.onNodeMouseout(d);
    }

    this.onNodeMousedown = function (d) {
        if(d.isClusterPlaceholder) return;

        return _nodelib.onNodeMousedown(d);
    }

    this.onNodeMouseup = function (d) {
        if(d.isClusterPlaceholder) return;

        return _nodelib.onNodeMouseup(d);
    }

    this.onNodeClick = function (d) {
        if(d.isClusterPlaceholder) {
            return; // For now, do nothing when clicking a placeholder node.
        }
        else {
            return _nodelib.onNodeClick(d);
        }
    }

    this.onNodeDblClick = function (d) { return _nodelib.onNodeDblClick(d); }
    this.onNodeRightClick = function (d) { return _nodelib.onNodeRightClick(d); }

    this.moveNodes = function (positions, time, ignoreLinks) {
        var self = this;    // We're using this within $.each() for now..
        graph.force.stop();
        graph.fixedMode = true;

        var center = this.getCenter();
        var node = null;
        var visNodes = self.getVisNodes();

        $.each(positions, function (i, position) {
            $.each(visNodes, function (j, n) {
                if (position.id == n.id) {
                    node = n;
                    n.fixed = true;
                    if (position.radius)
                        n._radius = position.radius;
                    if (position.opacity >= 0.0)
                        n.opacity = position.opacity;
                    if (position.color)
                        n.value.color = n.color = n._color = position.color;
                    if (position.labelColor)
                        n.labelColor = position.labelColor;
                    if (position.labelSize)
                        n.fontSize = position.labelSize;
                    if (position.labelOpacity)
                        n.labelOpacity = position.labelOpacity;

                    n.anchor = position.anchor;

                    var r = n._radius || n.radius;
                    if (position.x)
                        n.x = position.x; // Math.max(n.radius, Math.min(position.x, graph.width - r));
                    if (position.y)
                        n.y = position.y; // Math.max(n.radius, Math.min(position.y, graph.height - r));

                    return false;
                }
            });

            if (node) {
                graph.d3().selectAll('g.node[id="' + position.id + '"]')
                    .each(function (d) { d.fixed = true; })
                    .transition()
                    .delay(function (d, i) { return i * 2; })
                    .duration(time || 500)
                    .attr('cx', function(d) { return d.x; }).attr('cy', function(d) { return d.y; })
                    .attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });

                var x = graph.d3().selectAll('g.node[id="' + position.id + '"] circle')
                    .transition()
                    .delay(function (d, i) { return i * 2; })
                    .duration(time || 500);

                if(position.radius)
                    x = x.attr('r', node._radius || node.radius);
                if(position.opacity >= 0.0)
                    x = x.style('opacity', position.opacity || 1.0);
                if(position.color)
                    x.style('fill', position.color);
                if(position.stroke)
                    x.style('stroke', position.stroke);
                else if(position.color) {
                    node.color = position.color;
                    x.style('stroke', self.getNodeBorderColor(node));
                }
                var opacity = (node.labelOpacity || node.opacity || 1.0);
                graph.d3().selectAll('g.label[id="' + position.id + '"]')
                    //.transition()
                    //.duration(time || 500)
                    .style('opacity', opacity);

                graph.d3().selectAll('g.label[id="' + position.id + '"] text')
                    //.transition()
                    //.duration(time || 500)
                    .style('opacity', opacity)
                    //.text(function(d) { return opacity > 0 ? d.title : ''; })
                    //.style('font-size', function(d) { return jQuery.isNumeric(d.fontSize) ? d.fontSize + 'em' : d.fontSize })
                    .attr('text-anchor', function(d) { return position.anchor||(d.x < center.x ? 'end' : 'start') })
                    .attr('fill', function(d) { return position.labelColor || self.getNodeBorderColor(d); } /*LABEL FIX:node.labelColor*/);
            }
        });

        if (ignoreLinks)
            graph._links
                .transition()
                //.delay(function (d, i) { return i * 2; })
                .duration(time || 500)
                .style('opacity', 1.0)
                .attrTween('d', _linklib.calculatePathTween); //function (d) { return graph.linklib().calculatePath(d); });
        else
            graph._links
                .transition()
                .duration(time || 500)
                .style('opacity', function (d) {
                    // figure out what the opacity is for this link
                    var id = d.source.id;
                    var opacity = 0.0;
                    $.each(positions, function (i, p) {
                        if (p.id == id) {
                            if (p.links) {
                                $.each(p.links, function (j, link) {
                                    if (link.id == d.target.id) {
                                        if (link.opacity)
                                            opacity = link.opacity;
                                        return false;
                                    }
                                });
                            }
                        }
                    });
                    d._opacity = opacity;
                    return opacity;
                })
                .attr('stroke', function (d) {
                    // figure out what the color is for this link
                    var id = d.source.id;
                    var color = d.color;
                    $.each(positions, function (i, p) {
                        if (p.id == id) {
                            if (p.links) {
                                $.each(p.links, function (j, link) {
                                    if (link.id == d.target.id) {
                                        if (link.color)
                                            color = link.color;
                                        return false;
                                    }
                                });
                            }
                        }
                    });
                    return color;
                })
                .attr('stroke-width', function (d) {
                    // figure out what the color is for this link
                    var id = d.source.id;
                    var width = 2;
                    $.each(positions, function (i, p) {
                        if (p.id == id) {
                            if (p.links) {
                                $.each(p.links, function (j, link) {
                                    if (link.id == d.target.id) {
                                        if (link.width) {
                                            width = link.width;
                                        }
                                        return false;
                                    }
                                });
                            }
                        }
                    });
                    return parseInt(width||1);
                })
                .attrTween('d', _linklib.calculatePathTween);

        // Update labels
        graph.d3()
            .selectAll('g.label')
            .transition()
            .delay(function (d, i) { return i * 2; })
            .duration(time || 500)
            .attr('transform', function (node) { return graph.d3labels().transformLabel(node, center); });

        graph.updateLinkColors();

        graph.fixedMode = false;
    };


    this.updateMarkers = function () { _linklib.updateMarkers(); }

    this.calculateNodes = function () {
        var nodes = this.getVisNodes();
        if (nodes.length <= 0)
            return;

        var sorted = { size: nodes.slice(0), color: nodes.slice(0) };

        sorted.size.sort(function (a, b) {
            return b.value.size - a.value.size;
        });
        sorted.color.sort(function (a, b) {
            return b.value.color - a.value.color;
        });

        if(graph.settings.jenks > 0) {
            // generate jenks values
            var stats = {
                size: new geostats($.map(sorted.size, function(n) { return n.value.size; })),
                color: new geostats($.map(sorted.color, function(n) { return n.value.color; }))
            };
            try
            {
                var jenks = {
                    size: stats.size.getJenks(parseInt(graph.settings.jenks)),
                    color: stats.color.getJenks(parseInt(graph.settings.jenks))
                };

                // re-score each node as value = [1, x] based on its size and color values
                var dimensions = ['size', 'color'];
                $.each(dimensions, function(i, dimension) {
                    $.each(sorted[dimension], function(i, node) {
                        var assigned = 0;
                        for(var j = 1; j < jenks[dimension].length; j++) {
                            if(node.value[dimension] >= jenks[dimension][j])
                                assigned = j + 1;
                        }

                        node.jenks[dimension] = assigned;
                    });
                });
            }
            catch(e) { }
        }
        else {
            $.each(sorted.size, function(i, node) { node.jenks.size = 0; });
            $.each(sorted.color, function(i, node) { node.jenks.color = 0; });
        }

        var dimensions = ['size', 'color'];
        $.each(dimensions, $.proxy(function(i, dimension) {
            var list = sorted[dimension];

            if(dimension == 'color' && typeof(list[0].value.color) === "string") {
                list[0].color = new d3color(list[0].value.color).rgbastr();
                return;
            }

            var max = list[0].jenks[dimension] || list[0].value[dimension];
            var min = list[list.length - 1].jenks[dimension] || list[list.length - 1].value[dimension];

            for (var i = 0; i < list.length; i++) {
                var val = list[i].jenks[dimension] || list[i].value[dimension];
                var ratio = max < 0 ? 0 : (max == min) ? 0 : (val - min) / (max - min);

                if (isNaN(ratio))
                    ratio = 0.5;

                if (ratio < graph.settings.minRatio)
                    ratio = graph.settings.minRatio;

                list[i].rank = i;
                list[i].ratio[dimension] = ratio;

                if(dimension == 'size') {
                    list[i].radius = graph.settings.minRadius + ((graph.settings.maxRadius - graph.settings.minRadius) * ratio);
                    if (list[i].radius < graph.settings.minRadius)
                        list[i].radius = graph.settings.minRadius;
                    if (list[i].radius > graph.settings.maxRadius)
                        list[i].radius = graph.settings.maxRadius;

                    list[i].tooltip = this.getNodeTooltip(list[i]);
                }
                else {
                    list[i].color = d3colors.blend(
                        d3colors.getRgbaFromHex(graph.d3styles().colors.nodeMin),
                        d3colors.getRgbaFromHex(graph.d3styles().colors.nodeMax),
                        list[i].ratio.color).rgbastr();
                }
            }
        }, this));
    };

    this.getLinkTooltip = function (link) {
        if (graph.events.onLinkTooltip && typeof (graph.events.onLinkTooltip === "function"))
            return graph.events.onLinkTooltip(link);
    };

    this.calculateLinks = function () {
        var links = this.getVisLinks();

        var max = 0,
            min = Infinity,
            i,
            w;

        for (i = 0; i < links.length; i++) {
            w = links[i].value;
            if (w < min)
                min = w;
            if (w > max)
                max = w;
        }
        //if (min == max)
        //    min--;

        for (i = 0; i < links.length; i++) {
            if(max == min)
                links[i].normalized = links[i].ratio = 0;
            else {
                w = (links[i].value - min) / (max - min);
                links[i].normalized = w;
                links[i].ratio = links[i].value / max;
            }
            links[i].tooltip = this.getLinkTooltip(links[i]);
        }
    };

    this.calculate = function() {
        this.calculateNodes();
        this.calculateLinks();
    };


    this.onLinkMouseover = function (d) { return _linklib.onLinkMouseover(d); }
    this.onLinkMouseout = function (d) { return _linklib.onLinkMouseout(d); }
    this.onLinkClick = function (d) { return _linklib.onLinkClick(d); }

    this.getMarkerUrl = function (d) { return _linklib.getMarkerUrl(d); }

    this.getLinkWidth = function (d) { return _linklib.getLinkWidth(d); }
    this.getLinkColor = function (d, minColor, maxColor) {
        if (d.isClusterPlaceholder)
            return graph.d3styles().colors.linkMin;

        return _linklib.getLinkColor(d, minColor, maxColor);
    }

    this.calculatePath = function (d, b) { return _linklib.calculatePath(d, b); }

    this.updateLinkColors = function () { _linklib.updateLinkColors(); }




    this.updateSizesForZoom = function (scale) {
        _nodelib.updateNodeSizesForZoom(scale);
        _linklib.updateLinkSizesForZoom(scale);
    }

    /* Node methods */

    this.animateNodeClick = function(node, time, callback) {
        return _nodelib.animateNodeClick(node, time, callback);
    };

    this.setNodeTitle = function (node, title) {
        return _nodelib.setNodeTitle(node, title);
    };

    this.updateNodeColors = function () {
        return _nodelib.updateColors();
    }

    this.getNode = function (id) {
        return _nodelib.getNode(id);
    };

    this.getNodeByTitle = function(title) {
        return _nodelib.getNodeByTitle(title);
    };

    this.viewClusters = function (pct) {
        return _nodelib.viewClusters(pct);
    };

    /* End node methods */

    /* Link methods */


    this.getSharedLinks = function (nodes) {
        return _linklib.getSharedLinks(nodes);
    };

    /* End link methods */


    this.getCenter = function () {
        return _nodelib.getCenter();
    };

    this.clear = function () {
        _nodelib.clear();
        _linklib.clear();
    }


}
