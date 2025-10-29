import pandas as pd
import plotly.graph_objects as go
from dash import Dash, html, dcc
from dash.dependencies import Input, Output, State

# === Load and limit data ===
df = pd.read_csv("gantt_data.csv", parse_dates=["Start Date", "Completion"])
df = df.iloc[:15].copy()
df["Duration"] = (df["Completion"] - df["Start Date"]).dt.total_seconds() / 3600  # duration in hours

# === Config ===
row_height = 40
timeline_width_px = 3000

# === Custom color map ===
color_map = {
    "Black": "#000000",
    "Black Outline": "#444444",
    "Orange": "#f5642d",
    "Grey": "#A9A9A9"
}

# === Reverse the task order so first is at top
df["Task"] = df["Tasks"]
df = df[::-1].reset_index(drop=True)

# === Create horizontal bars using go.Bar with categorical y-axis
bars = go.Bar(
    x=df["Duration"],
    y=df["Task"],
    orientation='h',
    marker=dict(color=[color_map.get(c, "#999999") for c in df["Color"]]),
    base=df["Start Date"],
    hovertext=[
        f"{task}<br>Start: {start}<br>End: {end}"
        for task, start, end in zip(df["Task"], df["Start Date"], df["Completion"])
    ],
    hoverinfo="text",
)

layout = go.Layout(
    barmode="stack",  # removes spacing
    height=row_height * len(df),
    margin=dict(l=10, r=10, t=30, b=0),
    xaxis=dict(
        tickformat="%Y-%m-%d",
        showgrid=True,
        range=[
            df["Start Date"].min() - pd.Timedelta(days=2),
            df["Completion"].max() + pd.Timedelta(days=5)
        ]
    ),
    yaxis=dict(
        type='category',
        categoryorder='array',
        categoryarray=df["Task"].tolist(),
        showticklabels=False,
        showgrid=False
    ),
    plot_bgcolor="#f9f9f9",
    showlegend=False,
)

fig = go.Figure(data=[bars], layout=layout)

# === Dash app layout ===
app = Dash(__name__)

app.layout = html.Div([
    html.Div(
        id="horizontal-scroll-wrapper",
        style={
            "position": "fixed",
            "bottom": "0",
            "left": "300px",
            "right": "0",
            "height": "20px",
            "overflowX": "auto",
            "zIndex": "999",
            "backgroundColor": "#f9f9f9",
            "borderTop": "1px solid #ccc"
        },
        children=[
            html.Div(style={"width": f"{timeline_width_px}px", "height": "1px"})
        ]
    ),

    html.Div(
        style={"display": "flex", "marginTop": "30px"},
        children=[
            html.Div(
                id="task-names",
                style={
                    "width": "300px",
                    "height": f"{row_height * len(df)}px",
                    "overflowY": "auto",
                    "borderRight": "1px solid #ccc"
                },
                children=[
                    html.Div(
                        task,
                        style={
                            "height": f"{row_height}px",
                            "display": "flex",
                            "alignItems": "center",
                            "paddingLeft": "10px",
                            "borderBottom": "1px solid #eee",
                            "boxSizing": "border-box",
                            "whiteSpace": "nowrap"
                        },
                    )
                    for task in df["Task"]
                ]
            ),

            html.Div(
                id="chart-wrapper",
                style={
                    "width": "100%",
                    "height": f"{row_height * len(df)}px",
                    "overflow": "auto",
                    "position": "relative"
                },
                children=[
                    html.Div(
                        style={"width": f"{timeline_width_px}px", "height": f"{row_height * len(df)}px"},
                        children=[
                            dcc.Graph(
                                id="gantt-chart",
                                figure=fig,
                                config={"displayModeBar": False},
                                style={"height": "100%", "width": "100%"}
                            )
                        ]
                    )
                ]
            )
        ]
    )
])

# === Scroll sync callback ===
app.clientside_callback(
    """
    function(_, _) {
        const scrollBar = document.getElementById("horizontal-scroll-wrapper");
        const chartWrapper = document.getElementById("chart-wrapper");
        const taskNames = document.getElementById("task-names");

        if (scrollBar && chartWrapper) {
            scrollBar.onscroll = () => {
                chartWrapper.scrollLeft = scrollBar.scrollLeft;
            };
            chartWrapper.onscroll = () => {
                scrollBar.scrollLeft = chartWrapper.scrollLeft;
                taskNames.scrollTop = chartWrapper.scrollTop;
            };
            taskNames.onscroll = () => {
                chartWrapper.scrollTop = taskNames.scrollTop;
            };
        }

        return window.dash_clientside.no_update;
    }
    """,
    Output("gantt-chart", "figure"),
    Input("gantt-chart", "id"),
    State("gantt-chart", "figure")
)

if __name__ == "__main__":
    app.run(debug=True)
