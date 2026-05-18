import time

class EventLogger:
    def __init__(self):
        self.logs = []
        
    def log(self, event_type: str, details: str):
        entry = {
            "timestamp": time.time(),
            "event": event_type,
            "details": details
        }
        self.logs.append(entry)
        print(f"[{time.strftime('%H:%M:%S', time.localtime(entry['timestamp']))}] {event_type} | {details}")
        
    def get_logs(self):
        return self.logs
