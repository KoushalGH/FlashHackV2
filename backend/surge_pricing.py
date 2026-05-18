class SurgePricingEngine:
    def __init__(self):
        self.base_multiplier = 1.0
        
    def calculate_surge(self, total_cabs: int, active_cabs: int) -> float:
        if total_cabs == 0:
            return 1.0
            
        ratio = active_cabs / total_cabs
        if ratio > 0.8:
            return 2.0
        elif ratio > 0.6:
            return 1.5
        return 1.0
