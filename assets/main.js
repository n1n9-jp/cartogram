// hide the form if the browser doesn't do SVG,
// (then just let everything else fail)
if (!document.createElementNS) {
  document.getElementsByTagName("form")[0].style.display = "none";
}

var fields = [],
    fieldsById = {},
    field = null,
    colors = d3.schemeBlues[9];

var body = d3.select("body"),
    stat = d3.select("#status");

var fieldSelect = d3.select("#field")
  .on("change", function(e) {
    field = fields[this.selectedIndex];
    location.hash = "#" + field.id;
  });


var map = d3.select("#map"),
    layer = map.append("g")
          .attr("id", "layer"),
    states = layer.append("g")
      .attr("id", "states")
      .selectAll("path");


var proj = d3.geoMercator()
    .center([138, 36])
    .scale(1000)
    .translate([400, 250]),
    topology,
    geometries,
    rawData,
    dataById = {},
    carto = d3.cartogram()
      .projection(proj)
      .properties(function(d) {
        return dataById.get(d.properties.nam_ja);
      })
      .value(function(d) {
        return field && field.key ? +d.properties[field.key] : 1;
      });

window.onhashchange = function() {
  parseHash();
};

d3.json("data/japan.topojson", function(topo) {
  topology = topo;
  geometries = topology.objects.japan.geometries;
  d3.csv("data/theme.csv", function(data) {
    rawData = data;
    dataById = d3.nest()
      .key(function(d) { return d.都道府県; })
      .rollup(function(d) { return d[0]; })
      .map(data);
    
    // Create fields from CSV headers
    if (data.length > 0) {
      var headers = Object.keys(data[0]);
      fields = [{name: "(スケールなし)", id: "none"}];
      
      headers.forEach(function(header) {
        if (header !== "都道府県") {
          fields.push({
            name: header,
            id: header.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            key: header
          });
        }
      });
      
      fieldsById = d3.nest()
        .key(function(d) { return d.id; })
        .rollup(function(d) { return d[0]; })
        .map(fields);
      
      field = fields[0];
      
      // Populate field select options
      fieldSelect.selectAll("option").remove();
      fieldSelect.selectAll("option")
        .data(fields)
        .enter()
        .append("option")
          .attr("value", function(d) { return d.id; })
          .text(function(d) { return d.name; });
    }
    
    init();
  });
});

function init() {
  var features = carto.features(topology, geometries),
      path = d3.geoPath()
        .projection(proj);

  states = states.data(features)
    .enter()
    .append("path")
      .attr("class", "state")
      .attr("id", function(d) {
        return d.properties.nam_ja;
      })
      .attr("fill", "#fafafa")
      .attr("d", path);

  states.append("title");

  parseHash();
}

function reset() {
  stat.text("");
  body.classed("updating", false);

  var features = carto.features(topology, geometries),
      path = d3.geoPath()
        .projection(proj);

  states.data(features)
    .transition()
      .duration(750)
      .ease(d3.easeLinear)
      .attr("fill", "#fafafa")
      .attr("d", path);

  states.select("title")
    .text(function(d) {
      return d.properties.nam_ja;
    });
}

function update() {
  var start = Date.now();
  body.classed("updating", true);

  var key = field.key,
      fmt = d3.format(","),
      value = function(d) {
        return +d.properties[key];
      },
      values = states.data()
        .map(value)
        .filter(function(n) {
          return !isNaN(n);
        })
        .sort(d3.ascending),
      lo = values[0],
      hi = values[values.length - 1];

  var color = d3.scaleSequential()
    .interpolator(d3.interpolateBlues)
    .domain([lo, hi]);

  // normalize the scale to positive numbers
  var scale = d3.scaleLinear()
    .domain([lo, hi])
    .range([1, 1000]);

  // tell the cartogram to use the scaled values
  carto.value(function(d) {
    return scale(value(d));
  });

  // generate the new features, pre-projected
  var features = carto(topology, geometries).features;

  // update the data
  states.data(features)
    .select("title")
      .text(function(d) {
        return [d.properties.nam_ja, fmt(value(d))].join(": ");
      });

  states.transition()
    .duration(750)
    .ease(d3.easeLinear)
    .attr("fill", function(d) {
      return color(value(d));
    })
    .attr("d", carto.path);

  var delta = (Date.now() - start) / 1000;
  stat.text(["calculated in", delta.toFixed(1), "seconds"].join(" "));
  body.classed("updating", false);
}

var deferredUpdate = (function() {
  var timeout;
  return function() {
    var args = arguments;
    clearTimeout(timeout);
    stat.text("calculating...");
    return timeout = setTimeout(function() {
      update.apply(null, arguments);
    }, 10);
  };
})();

var hashish = d3.selectAll("a.hashish")
  .datum(function() {
    return this.href;
  });

function parseHash() {
  var desiredFieldId = location.hash.substr(1);

  field = fieldsById.get(desiredFieldId) || fields[0];

  fieldSelect.property("selectedIndex", fields.indexOf(field));

  if (field.id === "none") {
    reset();
  } else {
    deferredUpdate();
    location.replace("#" + field.id);

    hashish.attr("href", function(href) {
      return href + location.hash;
    });
  }
}