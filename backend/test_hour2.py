from backend.dispatcher import Dispatcher
import time

def run_tests():
    print("=== Testing Dispatch Flow & Surge Pricing ===")
    dispatcher = Dispatcher(fleet_size=10)
    
    # Try dispatching 8 cabs to trigger surge pricing (>60%)
    for i in range(1, 9):
        passenger_node = (i * 5) % 25
        print(f"\n--- Request {i} at Node {passenger_node} ---")
        result = dispatcher.dispatch_ride(passenger_node, method="bfs")
        print(f"Result: Cab {result.get('cab_pid')} dispatched via {result.get('method', 'bfs')}. Route hops: {result.get('hops')}")
        print(f"Surge Multiplier: {result.get('surge')}x")
        
        # Simulate cab arriving at passenger
        if 'cab_pid' in result:
            dispatcher.scheduler.cab_arrived_at_passenger(result['cab_pid'])

    print("\n=== Current Process Table (First 3) ===")
    table = dispatcher.scheduler.process_table()
    for cab in table[:3]:
        print(cab)

if __name__ == '__main__':
    run_tests()
