const width = window.innerWidth > 980 ? window.innerWidth - 370 : window.innerWidth;
const height = window.innerWidth > 980 ? window.innerHeight : Math.max(window.innerHeight * 0.72, 560);

const svg = d3.select("#graph-svg").attr("viewBox", [0, 0, width, height]);
const root = svg.append("g");
const linkLayer = root.append("g").attr("class", "links");
const edgeLabelLayer = root.append("g").attr("class", "edge-labels");
const nodeLayer = root.append("g").attr("class", "nodes");
const labelLayer = root.append("g").attr("class", "labels");

const fileInput = document.getElementById("file-input");
const searchInput = document.getElementById("search-input");
const labelsToggle = document.getElementById("labels-toggle");
const statusText = document.getElementById("status-text");
const legendList = document.getElementById("legend-list");
const detailsContent = document.getElementById("details-content");
const edgeDetailsContent = document.getElementById("edge-details-content");

const statSource = document.getElementById("stat-source");
const statNodes = document.getElementById("stat-nodes");
const statEdges = document.getElementById("stat-edges");

const colorByType = {
  CLAUSE: "#c26d38",
  PARTY: "#0f766e",
  DEFINED_TERM: "#5b5bd6",
  OBLIGATION: "#b42318",
  RIGHT: "#1d4ed8",
  PROHIBITION: "#7c2d12",
  CONDITION: "#9333ea",
  REFERENCE: "#475569",
  VALUE: "#b45309"
};

const hiddenDetailKeys = new Set(["index", "x", "y", "vx", "vy", "fx", "fy"]);

let simulation = null;
let currentGraph = null;
let selectedNodeId = null;
let selectedEdgeKey = null;
let neighborMap = new Map();

const zoom = d3.zoom()
  .scaleExtent([0.2, 4])
  .on("zoom", (event) => {
    root.attr("transform", event.transform);
  });

svg.call(zoom);

fileInput.addEventListener("change", handleFileOpen);
searchInput.addEventListener("input", applySearch);
labelsToggle.addEventListener("change", () => {
  labelLayer.style("display", labelsToggle.checked ? null : "none");
});

window.addEventListener("resize", () => window.location.reload());

function handleFileOpen(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      renderGraph(data);
      setStatus(`Loaded ${file.name}`);
    } catch (error) {
      setStatus(`Invalid JSON file: ${error.message}`);
    }
  };
  reader.readAsText(file);
}

function renderGraph(data) {
  const nodes = (data.nodes || []).map((node) => ({ ...node }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const links = (data.edges || [])
    .filter((edge) => nodeById.has(edge.src) && nodeById.has(edge.tgt))
    .map((edge) => ({
      ...edge,
      source: nodeById.get(edge.src),
      target: nodeById.get(edge.tgt)
    }));

  annotateLinkCurvature(links);

  currentGraph = { ...data, nodes, links };
  selectedNodeId = null;
  selectedEdgeKey = null;
  neighborMap = buildNeighborMap(nodes, links);

  statSource.textContent = data.source_file || "-";
  statNodes.textContent = nodes.length;
  statEdges.textContent = links.length;
  renderLegend(nodes);

  detailsContent.innerHTML = '<p class="muted">Select a node to inspect its attributes and connected relations.</p>';
  edgeDetailsContent.innerHTML = '<p class="muted">No edge selected.</p>';

  if (simulation) {
    simulation.stop();
  }

  const linkSelection = linkLayer
    .selectAll("path")
    .data(links, (d) => `${d.src}|${d.type}|${d.tgt}`)
    .join("path")
    .attr("class", "link")
    .on("click", (_, d) => selectEdge(d));

  const edgeLabelSelection = edgeLabelLayer
    .selectAll("text")
    .data(links, (d) => `${d.src}|${d.type}|${d.tgt}`)
    .join("text")
    .attr("class", "edge-label")
    .text((d) => d.type);

  const nodeSelection = nodeLayer
    .selectAll("circle")
    .data(nodes, (d) => d.id)
    .join("circle")
    .attr("class", "node")
    .attr("r", (d) => radiusForNode(d))
    .attr("fill", (d) => colorByType[d.node_type] || "#64748b")
    .on("click", (_, d) => selectNode(d))
    .call(dragBehavior());

  const labelSelection = labelLayer
    .selectAll("text")
    .data(nodes, (d) => d.id)
    .join("text")
    .attr("class", "node-label")
    .text((d) => labelForNode(d));

  labelLayer.style("display", labelsToggle.checked ? null : "none");

  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id).distance(linkDistance))
    .force("charge", d3.forceManyBody().strength(-220))
    .force("collide", d3.forceCollide().radius((d) => radiusForNode(d) + 16))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX(width / 2).strength(0.04))
    .force("y", d3.forceY(height / 2).strength(0.04))
    .on("tick", () => {
      linkSelection
        .attr("d", (d) => buildLinkArcPath(d));

      nodeSelection
        .attr("cx", (d) => d.x)
        .attr("cy", (d) => d.y);

      labelSelection
        .attr("x", (d) => d.x + radiusForNode(d) + 4)
        .attr("y", (d) => d.y + 3);

      edgeLabelSelection
        .attr("x", (d) => edgeLabelPosition(d).x)
        .attr("y", (d) => edgeLabelPosition(d).y)
        .attr("text-anchor", "middle");
    });

  svg.transition().duration(400).call(
    zoom.transform,
    d3.zoomIdentity.translate(0, 0).scale(1)
  );

  applySearch();
}

function buildNeighborMap(nodes, links) {
  const map = new Map(nodes.map((node) => [node.id, new Set([node.id])]));
  links.forEach((link) => {
    map.get(link.source.id)?.add(link.target.id);
    map.get(link.target.id)?.add(link.source.id);
  });
  return map;
}

function annotateLinkCurvature(links) {
  const groups = new Map();

  links.forEach((link) => {
    const key = [link.source.id, link.target.id].sort().join("||");
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(link);
  });

  groups.forEach((group) => {
    group.forEach((link, index) => {
      const centerOffset = index - (group.length - 1) / 2;
      const direction = link.source.id <= link.target.id ? 1 : -1;
      link.curveOffset = centerOffset * 22 * direction;
    });
  });
}

function selectNode(node) {
  selectedNodeId = node.id;
  selectedEdgeKey = null;
  edgeDetailsContent.innerHTML = '<p class="muted">No edge selected.</p>';
  renderDetails(node);
  updateHighlightState();
}

function selectEdge(edge) {
  selectedNodeId = null;
  selectedEdgeKey = edgeKey(edge);
  detailsContent.innerHTML = '<p class="muted">Select a node to inspect its attributes and connected relations.</p>';
  renderEdgeDetails(edge);
  updateHighlightState();
}

function renderDetails(node) {
  const connectedLinks = currentGraph.links.filter(
    (link) => link.source.id === node.id || link.target.id === node.id
  );

  const fields = Object.entries(node).filter(
    ([key, value]) => !hiddenDetailKeys.has(key) && value !== null && value !== ""
  );
  const relations = connectedLinks.map((link) => {
    const direction = link.source.id === node.id ? "out" : "in";
    const counterpart = direction === "out" ? link.target : link.source;
    return `${direction.toUpperCase()} · ${link.type} · ${labelForNode(counterpart)}`;
  });

  detailsContent.innerHTML = `
    <h3>${escapeHtml(labelForNode(node))}</h3>
    <div class="details-grid">
      ${fields.map(([key, value]) => `
        <div class="detail-row">
          <span class="detail-key">${escapeHtml(key)}</span>
          <div>${escapeHtml(stringifyValue(value))}</div>
        </div>
      `).join("")}
    </div>
    <div>
      <h3>Connected relations</h3>
      <div class="related-list">
        ${relations.length ? relations.map((item) => `<div class="related-item">${escapeHtml(item)}</div>`).join("") : '<p class="muted">No connected relations.</p>'}
      </div>
    </div>
  `;
}

function renderEdgeDetails(edge) {
  edgeDetailsContent.innerHTML = `
    <div class="edge-meta">
      <div class="detail-row">
        <span class="detail-key">Source</span>
        <div>${escapeHtml(labelForNode(edge.source))}</div>
      </div>
      <div class="detail-row">
        <span class="detail-key">Relation</span>
        <div>${escapeHtml(edge.type)}</div>
      </div>
      <div class="detail-row">
        <span class="detail-key">Target</span>
        <div>${escapeHtml(labelForNode(edge.target))}</div>
      </div>
    </div>
    <div class="triplet-card">
      <span class="triplet-label">Triplet</span>
      <div class="triplet-value">${escapeHtml(labelForNode(edge.source))} → ${escapeHtml(edge.type)} → ${escapeHtml(labelForNode(edge.target))}</div>
    </div>
    <div class="details-grid">
      <div class="detail-row">
        <span class="detail-key">Source ID</span>
        <div>${escapeHtml(edge.source.id)}</div>
      </div>
      <div class="detail-row">
        <span class="detail-key">Target ID</span>
        <div>${escapeHtml(edge.target.id)}</div>
      </div>
    </div>
  `;
}

function applySearch() {
  if (!currentGraph) {
    return;
  }

  updateHighlightState();
}

function updateHighlightState() {
  const matches = getSearchMatches();
  const activeNeighbors = selectedNodeId ? neighborMap.get(selectedNodeId) || new Set() : null;

  nodeLayer.selectAll(".node")
    .classed("active", (d) => d.id === selectedNodeId)
    .classed("dimmed", (d) => {
      const searchDimmed = matches ? !matches.has(d.id) : false;
      const selectionDimmed = activeNeighbors ? !activeNeighbors.has(d.id) : false;
      return searchDimmed || selectionDimmed;
    });

  labelLayer.selectAll(".node-label")
    .classed("dimmed", (d) => {
      const searchDimmed = matches ? !matches.has(d.id) : false;
      const selectionDimmed = activeNeighbors ? !activeNeighbors.has(d.id) : false;
      return searchDimmed || selectionDimmed;
    });

  edgeLabelLayer.selectAll(".edge-label")
    .classed("dimmed", (d) => {
      const searchDimmed = matches ? !(matches.has(d.source.id) || matches.has(d.target.id)) : false;
      const edgeSelectionDimmed = selectedEdgeKey ? edgeKey(d) !== selectedEdgeKey : false;
      const nodeSelectionDimmed = activeNeighbors
        ? !(d.source.id === selectedNodeId || d.target.id === selectedNodeId)
        : false;
      return searchDimmed || edgeSelectionDimmed || nodeSelectionDimmed;
    });

  linkLayer.selectAll(".link")
    .classed("active", (d) =>
      (selectedNodeId && (d.source.id === selectedNodeId || d.target.id === selectedNodeId)) ||
      (selectedEdgeKey && edgeKey(d) === selectedEdgeKey)
    )
    .classed("dimmed", (d) => {
      const searchDimmed = matches ? !(matches.has(d.source.id) || matches.has(d.target.id)) : false;
      const edgeSelectionDimmed = selectedEdgeKey ? edgeKey(d) !== selectedEdgeKey : false;
      const nodeSelectionDimmed = activeNeighbors
        ? !(d.source.id === selectedNodeId || d.target.id === selectedNodeId)
        : false;
      return searchDimmed || edgeSelectionDimmed || nodeSelectionDimmed;
    });
}

function getSearchMatches() {
  if (!currentGraph) {
    return null;
  }

  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    return null;
  }

  return new Set(
    currentGraph.nodes
      .filter((node) => JSON.stringify(node).toLowerCase().includes(query))
      .map((node) => node.id)
  );
}

function renderLegend(nodes) {
  const typeCounts = d3.rollups(
    nodes,
    (values) => values.length,
    (node) => node.node_type || "UNKNOWN"
  ).sort((a, b) => d3.descending(a[1], b[1]));

  legendList.innerHTML = typeCounts.map(([type, count]) => `
    <li class="legend-item">
      <span class="legend-swatch" style="background:${colorByType[type] || "#64748b"}"></span>
      <span>${escapeHtml(type)} (${count})</span>
    </li>
  `).join("");
}

function dragBehavior() {
  function dragStarted(event) {
    if (!event.active) {
      simulation.alphaTarget(0.3).restart();
    }
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }

  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  function dragEnded(event) {
    if (!event.active) {
      simulation.alphaTarget(0);
    }
    event.subject.fx = null;
    event.subject.fy = null;
  }

  return d3.drag().on("start", dragStarted).on("drag", dragged).on("end", dragEnded);
}

function radiusForNode(node) {
  const byType = {
    CLAUSE: 13,
    OBLIGATION: 11,
    RIGHT: 11,
    PROHIBITION: 11,
    PARTY: 10,
    CONDITION: 9,
    DEFINED_TERM: 8,
    REFERENCE: 8,
    VALUE: 7
  };
  return byType[node.node_type] || 8;
}

function linkDistance(link) {
  const distanceByType = {
    CONTAINS: 95,
    ASSIGNS_OBLIGATION_TO: 122,
    GRANTS_RIGHT_TO: 122,
    ASSIGNS_PROHIBITION_TO: 122,
    DEPENDS_ON: 132,
    REFERENCES: 138,
    USES: 108,
    DEFINES: 108,
    HAS_VALUE: 96,
    CITES: 116
  };
  return distanceByType[link.type] || 110;
}

function labelForNode(node) {
  return node.clause_id || node.term || node.name || node.action || node.trigger || node.amount || node.id;
}

function edgeKey(edge) {
  return `${edge.source.id}|${edge.type}|${edge.target.id}`;
}

function buildLinkArcPath(link) {
  const x1 = link.source.x;
  const y1 = link.source.y;
  const x2 = link.target.x;
  const y2 = link.target.y;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = -dy / distance;
  const ny = dx / distance;
  const curveOffset = link.curveOffset || 0;
  const cx = (x1 + x2) / 2 + nx * curveOffset;
  const cy = (y1 + y2) / 2 + ny * curveOffset;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

function edgeLabelPosition(link) {
  const x1 = link.source.x;
  const y1 = link.source.y;
  const x2 = link.target.x;
  const y2 = link.target.y;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = -dy / distance;
  const ny = dx / distance;
  const curveOffset = link.curveOffset || 0;

  return {
    x: (x1 + x2) / 2 + nx * curveOffset * 0.5,
    y: (y1 + y2) / 2 + ny * curveOffset * 0.5 - 4
  };
}

function stringifyValue(value) {
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function setStatus(message) {
  statusText.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
