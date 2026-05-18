# pyrefly: ignore [missing-import]
import pytest
from backend.scheduler import CabScheduler
from backend.cab_process import CabState

def test_scheduler_initialization():
    scheduler = CabScheduler(fleet_size=5)
    assert len(scheduler.process_list) == 5
    assert len(scheduler.ready_queue) == 5
    assert scheduler.get_active_count() == 0

def test_dispatch_flow():
    scheduler = CabScheduler(fleet_size=2)
    pid = 1
    
    scheduler.dispatch_cab(pid, 10, {"passenger_node": 10})
    assert pid not in scheduler.ready_queue
    assert scheduler.get_active_count() == 1
    assert scheduler.process_list[pid].state == CabState.DISPATCHED
    
    scheduler.cab_arrived_at_passenger(pid)
    assert scheduler.process_list[pid].state == CabState.EN_ROUTE
    
    scheduler.complete_ride(pid, 15)
    assert pid in scheduler.ready_queue
    assert scheduler.get_active_count() == 0
    assert scheduler.process_list[pid].state == CabState.IDLE
    assert scheduler.process_list[pid].current_node == 15
