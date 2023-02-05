import {HttpClient} from '@angular/common/http';
import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {FormControl} from '@angular/forms';
import {MatAutocompleteSelectedEvent} from '@angular/material/autocomplete';
import {ActivatedRoute, Router} from '@angular/router';
import {ChartConfiguration, ChartOptions} from 'chart.js';
import {BaseChartDirective} from 'ng2-charts';
import {map, Observable, startWith} from 'rxjs';
import {NAMES} from './names';
import {STATS} from './stats';

class Person {
  constructor(public name: string, public ageDifference: number = 0) {
  }
}

interface VisitorResponse {
  visitorsMonth: number
  visitorsTotal: number
}

interface Stat {
  counts: number[];
  name: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  public nameCtrl = new FormControl('');
  public filteredNames: Observable<string[]>;
  public selectedPeople: Person[] = [];
  public allNames: string[] = NAMES;
  private stats: Stat[] = STATS;

  public visitors?: VisitorResponse;

  public guesses: number[] | undefined;

  public lineChartData: ChartConfiguration<'line'>['data'] = {
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Namensverteilung in %',
        fill: true,
        tension: 0.3,
        borderColor: 'blue',
        backgroundColor: 'rgba(0,89,255,0.3)',
        pointStyle: false,
      }
    ]
  };
  public lineChartOptions: ChartOptions<'line'> = {
    responsive: false
  };

  @ViewChild(BaseChartDirective) lineChart?: BaseChartDirective;

  @ViewChild('nameInput')
  public nameInput: ElementRef<HTMLInputElement> | undefined;

  public constructor(
    private readonly http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    this.filteredNames = this.nameCtrl.valueChanges.pipe(
      startWith(null),
      map((name: string | null) => (name ? this._filter(name) : this.allNames.slice(0, 10))),
    );
  }

  public ngOnInit(): void {
    // Init labels
    for (let i = 1921; i <= 2021; i++) {
      this.lineChartData.labels!.push('' + i)
    }
    this.route.queryParams.subscribe(params => {
        if (params['names'] == null || params['names'] === '') {
          return;
        }
        const rawNames = params['names'].split(',');
        this.selectedPeople = rawNames.map((n: string) => {
          let name = n;
          let ageDifference = 0;
          if (n.indexOf('+') !== -1) {
            name = n.split('+')[0]
            ageDifference = +n.split('+')[1]
          } else if (n.indexOf('-') !== -1) {
            name = n.split('-')[0]
            ageDifference = -n.split('-')[1]
          }
          return new Person(name, ageDifference)
        })
      }
    );
    this.fetchVisitorCount();
  }

  public getIndex(nameSelection: Person): number {
    return this.selectedPeople.indexOf(nameSelection);
  }

  public changeAge(nameSelection: Person, item: number) {
    nameSelection.ageDifference += item;
    this.updateQueryParams();
  }

  public remove(nameSelection: Person): void {
    const index = this.getIndex(nameSelection);
    if (index >= 0) {
      this.selectedPeople.splice(index, 1);
    }
    this.updateQueryParams()
  }

  public selected(event: MatAutocompleteSelectedEvent): void {
    this.selectedPeople.push(new Person(event.option.viewValue));
    if (this.nameInput) {
      this.nameInput.nativeElement.value = '';
    }
    this.nameCtrl.setValue(null);
    this.updateQueryParams()
  }

  public guess(): void {
    const selectedNames = this.selectedPeople.map(person => person.name);
    const separateCounts = selectedNames.map(name => this.stats.find(stat => stat.name === name)!)
    .map(stat => stat.counts);

    const counts = separateCounts[0].map(sc => sc);
    for (let i = 1; i < separateCounts.length; i++) {
      for (let idx = 0; idx < 100; idx++) {
        const offsetIdx = idx + this.selectedPeople[i].ageDifference;
        let m = 0;
        if (offsetIdx >= 0 && offsetIdx < 100) {
          m = separateCounts[i][offsetIdx]
        }
        counts[idx] *= m
      }
    }
    const countsSum = counts.reduce((partialSum, a) => partialSum + a, 0);
    // Normalize to 100%
    this.lineChartData.datasets[0].data = counts.map(c => c / countsSum * 100);
    this.lineChart?.update();

    // Find best age guesses
    let ageGuesses: number[][] = [];
    counts.forEach((value, index) => {
      ageGuesses.push([value, index]);
    });
    ageGuesses = ageGuesses.sort((a, b) => b[0] - a[0])

    // Data starts at 2021 (=0), add offset
    const yearOffset = new Date().getFullYear() - 2021;
    const guesses = ageGuesses.map(ag => (100 - ag[1]) + yearOffset);

    this.guesses = guesses.slice(0, 4);
  }

  public getImage(person: Person): string {
    return `url('https://api.multiavatar.com/${person.name}.svg?apikey=5SHtBNTd6F7Ofm')`
  }

  private _filter(value: string): string[] {
    const filterValue = value.toLowerCase();
    return this.allNames.filter(name => !this.selectedPeople.map(n => n.name.toLowerCase()).includes(name.toLowerCase())
      && name.toLowerCase().startsWith(filterValue)).slice(0, 10);
  }

  private fetchVisitorCount(): void {
    this.http.get<VisitorResponse>('https://akleemans.pythonanywhere.com/api/visitors')
    .subscribe(visitorResponse => this.visitors = visitorResponse);
  }

  private updateQueryParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        names: this.selectedPeople.map(p => {
          if (p.ageDifference < 0) {
            return p.name + '-' + Math.abs(p.ageDifference)
          } else if (p.ageDifference > 0) {
            return p.name + '+' + p.ageDifference
          }
          return p.name
        }).join(',')
      },
      queryParamsHandling: 'merge',
      // TODO check if needed
      // skipLocationChange: true
    }).then();
  }
}
