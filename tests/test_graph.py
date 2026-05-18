import pytest
from backend.city_graph import CityGraph

def test_graph_initialization():
    graph = CityGraph()
    assert len(graph.nodes) == 25
    assert len(graph.edges) == 25
    
def test_bfs_nearest_cab():
    graph = CityGraph()
    ready_cabs = {0, 24} # Cabs at opposite corners
    passenger = 4 # Top right corner
    
    # Nearest to 4 should be 0 since 24 is much further
    nearest, path = graph.bfs_nearest_cab(passenger, ready_cabs)
    assert nearest == 0
    assert len(path) > 0
    assert path[0] == 0
    assert path[-1] == passenger

def test_dfs_explore_routes():
    graph = CityGraph()
    routes = graph.dfs_explore_routes(0, 5, max_depth=3)
    assert len(routes) > 0
    for route in routes:
        assert route[0] == 0
        assert route[-1] == 5
