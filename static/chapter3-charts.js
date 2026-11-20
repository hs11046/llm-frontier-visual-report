// The report and Ch3 share the same cost series, units, and visual encodings.
(() => {
  const { colors, orgColor } = ReportCharts;
  const escape = echarts.format.encodeHTML;
  const legend = { type: "scroll", bottom: 1, left: 6, right: 6 };
  const namedAxis = (type, name, nameGap) => ({
    type,
    name,
    nameGap,
    nameLocation: "middle",
  });
  const money = (n) =>
    Math.abs(n) >= 1000 ? "$" + n / 1000 + "B" : "$" + n + "M";
  const sectorColors = {
    Academia: colors.academia,
    Industry: colors.industry,
    "Industry-academia collaboration": colors.purple,
    Other: colors.unknown,
  };

  function cost({ points, trend, annualGrowth }) {
    const series = [];
    for (const sector of ["Academia", "Industry"]) {
      for (const access of ["Open", "Closed"]) {
        const data = points
          .filter((p) => p.sector === sector && p.access === access)
          .map((p) => ({
            value: [p.date, p.cost],
            model: p.model,
            org: p.org,
          }));
        if (!data.length) continue;
        series.push({
          name: sector + " (" + access + ")",
          type: "scatter",
          data,
          symbol: access === "Open" ? "diamond" : "circle",
          symbolSize: 8,
          itemStyle: { color: sectorColors[sector], opacity: 0.83 },
          tooltip: {
            formatter: (p) =>
              [
                escape(p.data.model),
                escape(p.data.org),
                p.seriesName,
                p.value[0] + " · " + money(Number(p.value[1].toFixed(1))),
              ].join("<br>"),
          },
        });
      }
    }
    if (trend.length)
      series.push({
        name: "Mean trend (~" + annualGrowth.toFixed(1) + "× / yr)",
        type: "line",
        data: trend,
        showSymbol: false,
        silent: true,
        itemStyle: { color: colors.ink },
        lineStyle: { type: "dashed", color: colors.ink },
      });
    return {
      useUTC: true,
      grid: { left: 54, right: 14, top: 12, bottom: 62, containLabel: true },
      tooltip: {},
      legend,
      xAxis: namedAxis("time", "Publication date", 27),
      yAxis: {
        ...namedAxis("log", "Training cost (2023 USD)", 49),
        min: 0.1,
        max: 800,
        axisLabel: { formatter: money },
      },
      series,
    };
  }

  function funding(rows) {
    const ordered = rows.slice().sort((a, b) => a.val - b.val);
    const axisColor = (v) =>
      v < 1 ? colors.closed : v < 2 ? colors.gold : colors.teal;
    const stem = ordered
      .map((r) => [[0.002, r.entity], [r.val, r.entity], null])
      .flat();
    return {
      // Left margin 215 prevents truncation of "Top University Allocation" & "Typical Academic Lab"
      grid: { left: 215, right: 46, top: 58, bottom: 44, containLabel: false },
      tooltip: {},
      xAxis: {
        ...namedAxis("log", "Number of Frontier Models Affordable (log scale)", 30),
        min: 0.002,
        max: 60,
        axisLabel: { formatter: (v) => v + "×" },
      },
      yAxis: {
        type: "category",
        data: ordered.map((r) => r.entity),
        axisLabel: { interval: 0, color: colors.ink },
      },
      series: [
        {
          type: "line",
          data: stem,
          showSymbol: false,
          silent: true,
          lineStyle: { color: colors.axis },
          markArea: {
            silent: true,
            data: [
              [{ xAxis: 0.002, itemStyle: { color: "#fbf4f2" } }, { xAxis: 1 }],
              [{ xAxis: 1, itemStyle: { color: "#edf6f4" } }, { xAxis: 60 }],
            ],
          },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: "#c2410c", type: "dashed", width: 1.5 },
            label: {
              show: true,
              position: "end",
              distance: 8,
              align: "center",
              verticalAlign: "bottom",
              color: "#c2410c",
              fontSize: 10,
              fontWeight: "bold",
              lineHeight: 14,
              formatter: "Survival Threshold: 1 Frontier Model (~$366M)\nGPT-4.5 estimated training cost, 2025",
            },
            data: [{ xAxis: 1 }],
          },
        },
        {
          type: "scatter",
          symbolSize: 11,
          data: ordered.map((r) => ({
            value: [r.val, r.entity],
            source: r,
            itemStyle: { color: axisColor(r.val) },
          })),
          label: {
            show: true,
            position: "right",
            color: colors.ink,
            formatter: (p) =>
              p.value[0].toFixed(p.value[0] < 0.1 ? 3 : 2) + "×",
          },
          tooltip: {
            formatter: (p) => {
              const r = p.data.source;
              return [
                escape(r.entity),
                "Total capital: $" + r.funding_usd.toLocaleString("en-US"),
                p.value[0] + "× · " + r.date,
                r.backer && "Strategic backer: " + escape(r.backer),
                escape(r.scale),
              ]
                .filter(Boolean)
                .join("<br>");
            },
          },
        },
      ],
    };
  }

  function sector({ years, shares }) {
    return {
      tooltip: { trigger: "axis", valueFormatter: (v) => v.toFixed(1) + "%" },
      legend,
      grid: { top: 14, left: 8, right: 12, bottom: 41, containLabel: true },
      xAxis: { type: "category", data: years },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { formatter: "{value}%" },
      },
      series: Object.entries(shares).map(([name, data]) => ({
        name,
        type: "bar",
        stack: "sector",
        data,
        itemStyle: { color: sectorColors[name] },
      })),
    };
  }

  function compute(groups) {
    const series = [];
    for (const [name, source] of Object.entries(groups)) {
      const color = sectorColors[name];
      series.push({
        name,
        type: "scatter",
        symbolSize: 9,
        itemStyle: { color },
        data: source.models.map((m) => ({
          name: m.model,
          value: [m.date, m.flops],
        })),
        tooltip: {
          formatter: (p) =>
            [
              escape(p.name),
              name + " · " + p.value[0],
              p.value[1].toExponential(1) + " FLOPs",
            ].join("<br>"),
        },
      });
      series.push({
        name: name + " trend",
        type: "line",
        showSymbol: false,
        data: source.trend,
        itemStyle: { color },
        lineStyle: { color, type: name === "Industry" ? "dashed" : "dotted" },
        silent: true,
        legendHoverLink: false,
      });
    } // <-- This closing bracket was missing

    if (series.length > 0) {
      series[0].markLine = {
        silent: true,
        symbol: "none",
        lineStyle: { color: colors.unknown, type: "dotted" },
        label: {
          position: "insideStartTop",
          formatter: "Academic ceiling ≈ 10²⁴",
        },
        data: [{ yAxis: 1e24 }],
      };
    }

    return {
      useUTC: true,
      series,
      tooltip: {},
      legend: {
        ...legend,
        data: ["Academia", "Industry"], // Hides the trend lines from the legend
      },
      grid: { top: 18, left: 45, right: 16, bottom: 43, containLabel: true },
      xAxis: { type: "time" },
      yAxis: {
        ...namedAxis("log", "Training compute (FLOPs)", 48),
        min: 1e23,
        max: 1e27,
        axisLabel: { formatter: (v) => "10^" + Math.round(Math.log10(v)) },
      },
    };
  }

  function spending({ years, labs }) {
    const format = (v) => "$" + Number(v).toFixed(1) + "B";
    return {
      tooltip: { trigger: "axis", valueFormatter: format },
      legend,
      grid: { top: 22, left: 8, right: 12, bottom: 40, containLabel: true },
      xAxis: { type: "category", data: years },
      yAxis: {
        type: "value",
        max: 20,
        axisLabel: { formatter: (v) => "$" + v + "B" },
      },
      series: Object.entries(labs).map(([name, data]) => ({
        name,
        type: "bar",
        data,
        itemStyle: { color: orgColor(name) },
        label: {
          show: true,
          position: "top",
          formatter: (p) => format(p.value),
        },
      })),
    };
  }

  window.Chapter3Charts = { cost, funding, sector, compute, spending };
})();