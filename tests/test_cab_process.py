import pytest
from backend.cab_process import CabPCB, CabState, InvalidStateTransition

def test_cab_pcb_initialization():
    cab = CabPCB(pid=1, start_node=5)
    assert cab.pid == 1
    assert cab.current_node == 5
    assert cab.state == CabState.REGISTERED

def test_valid_state_transitions():
    cab = CabPCB(pid=1, start_node=5)
    cab.transition(CabState.IDLE)
    assert cab.state == CabState.IDLE
    
    cab.transition(CabState.DISPATCHED)
    assert cab.state == CabState.DISPATCHED
    
    cab.transition(CabState.EN_ROUTE)
    assert cab.state == CabState.EN_ROUTE
    
    cab.transition(CabState.COMPLETED)
    assert cab.state == CabState.COMPLETED
    
    cab.transition(CabState.IDLE)
    assert cab.state == CabState.IDLE

def test_invalid_state_transition():
    cab = CabPCB(pid=1, start_node=5)
    cab.transition(CabState.IDLE)
    
    with pytest.raises(InvalidStateTransition):
        cab.transition(CabState.COMPLETED)
