from backend.cab_process import CabPCB, CabState
from typing import Dict, List

class CabScheduler:
    def __init__(self, fleet_size: int = 10):
        self.process_list: Dict[int, CabPCB] = {}
        self.ready_queue = set() # Store PIDs of IDLE cabs
        
        # Initialize fleet
        for i in range(fleet_size):
            pid = i + 1
            # distribute cabs around some nodes
            start_node = (i * 3) % 25
            cab = CabPCB(pid, start_node)
            cab.transition(CabState.IDLE, "System init")
            self.process_list[pid] = cab
            self.ready_queue.add(pid)
            
    def get_ready_cabs_nodes(self) -> set:
        """ Returns the set of nodes where IDLE cabs are currently located """
        return {self.process_list[pid].current_node for pid in self.ready_queue}
        
    def get_pid_at_node(self, node: int) -> int:
        """ Finds the PID of an IDLE cab at a specific node """
        for pid in self.ready_queue:
            if self.process_list[pid].current_node == node:
                return pid
        return -1
        
    def dispatch_cab(self, pid: int, passenger_node: int, ride_details: dict):
        """ Schedules a cab for a ride, removing it from the ready queue """
        if pid not in self.ready_queue:
            raise Exception(f"Cab {pid} is not in ready queue")
            
        cab = self.process_list[pid]
        self.ready_queue.remove(pid)
        
        cab.assigned_ride = ride_details
        cab.transition(CabState.DISPATCHED, f"Assigned to passenger at node {passenger_node}")
        
    def cab_arrived_at_passenger(self, pid: int):
        cab = self.process_list[pid]
        cab.transition(CabState.EN_ROUTE, "Picked up passenger")
        
    def complete_ride(self, pid: int, dest_node: int):
        """ Completes a ride, returning the cab to the ready queue """
        cab = self.process_list[pid]
        cab.transition(CabState.COMPLETED, f"Dropped off passenger at node {dest_node}")
        cab.current_node = dest_node
        cab.assigned_ride = None
        cab.transition(CabState.IDLE, "Ready for next ride")
        self.ready_queue.add(pid)
        
    def process_table(self) -> List[dict]:
        """ Returns a snapshot of all cab PCBs """
        return [cab.to_dict() for cab in self.process_list.values()]
        
    def get_active_count(self) -> int:
        """ Returns the number of cabs currently NOT idle """
        return len(self.process_list) - len(self.ready_queue)
