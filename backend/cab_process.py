import time
from enum import Enum
from typing import List, Dict, Any, Optional

class CabState(Enum):
    REGISTERED = "REGISTERED" # newly created, not yet in ready queue
    IDLE = "IDLE"             # Ready queue, waiting for dispatch
    DISPATCHED = "DISPATCHED" # Running/assigned, heading to passenger
    EN_ROUTE = "EN_ROUTE"     # Waiting, traveling with passenger
    COMPLETED = "COMPLETED"   # Terminated, ride finished, will transition to IDLE

class InvalidStateTransition(Exception):
    pass

class CabPCB:
    # Class-level state transition rules
    VALID_TRANSITIONS = {
        CabState.REGISTERED: [CabState.IDLE],
        CabState.IDLE: [CabState.DISPATCHED],
        CabState.DISPATCHED: [CabState.EN_ROUTE, CabState.IDLE], # Cancelled -> IDLE
        CabState.EN_ROUTE: [CabState.COMPLETED],
        CabState.COMPLETED: [CabState.IDLE]
    }

    def __init__(self, pid: int, start_node: int):
        self.pid = pid
        self.state = CabState.REGISTERED
        self.priority = 0
        self.current_node = start_node
        self.assigned_ride: Optional[Dict[str, Any]] = None
        self.created_at = time.time()
        self.state_history: List[Dict[str, Any]] = []
        
        self._log_state(self.state, "Process created")

    def _log_state(self, state: CabState, reason: str = ""):
        self.state_history.append({
            "state": state.value,
            "timestamp": time.time(),
            "reason": reason
        })

    def transition(self, new_state: CabState, reason: str = ""):
        if new_state not in self.VALID_TRANSITIONS[self.state]:
            raise InvalidStateTransition(
                f"Cab {self.pid} cannot transition from {self.state.value} to {new_state.value}."
            )
        
        self.state = new_state
        self._log_state(new_state, reason)
        
    def to_dict(self):
        return {
            "pid": self.pid,
            "state": self.state.value,
            "current_node": self.current_node,
            "assigned_ride": self.assigned_ride,
            "history": self.state_history
        }
